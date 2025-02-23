import { Logging, Workspace } from '@aws/language-server-runtimes/server-interface'
import * as archiver from 'archiver'
import * as crypto from 'crypto'
import * as fs from 'fs'
import { CodeFile, Project, References, RequirementJson, StartTransformRequest } from './models'
import path = require('path')
const requriementJsonFileName = 'requirement.json'
const artifactFolderName = 'artifact'
const referencesFolderName = 'references'
const zipFileName = 'artifact.zip'
const sourceCodeFolderName = 'sourceCode'
const packagesFolderName = 'packages'

export class ArtifactManager {
    private workspace: Workspace
    private logging: Logging
    private workspacePath: string

    constructor(workspace: Workspace, logging: Logging, workspacePath: string) {
        this.workspace = workspace
        this.logging = logging
        this.workspacePath = workspacePath
    }

    async createZip(request: StartTransformRequest): Promise<string> {
        await this.createRequirementJson(request)
        await this.copySolutionConfigFiles(request)
        await this.removeDuplicateNugetPackagesFolder(request)
        return await this.zipArtifact()
    }

    async removeDir(dir: string) {
        if (await this.workspace.fs.exists(dir)) {
            await this.workspace.fs.rm(dir, { recursive: true, force: true })
        }
    }

    cleanup() {
        try {
            const artifactFolder = path.join(this.workspacePath, artifactFolderName)
            const zipFile = path.join(this.workspacePath, zipFileName)
            fs.rmSync(artifactFolder, { recursive: true, force: true })
            fs.unlinkSync(zipFile)
            fs.rmSync(this.workspacePath, { recursive: true, force: true })
        } catch (error) {
            this.logging.log('Failed to cleanup:' + error)
        }
    }

    async removeDuplicateNugetPackagesFolder(request: StartTransformRequest) {
        const packagesFolder = path.join(
            this.workspacePath,
            artifactFolderName,
            sourceCodeFolderName,
            packagesFolderName
        )
        if (fs.existsSync(packagesFolder)) {
            fs.rmSync(packagesFolder, { recursive: true, force: true })
            this.logging.log(
                `Removed packages folder ${packagesFolder} from source code directory to be uploaded because it is a duplicate of references folder from artifacts`
            )
        }
    }

    async createRequirementJson(request: StartTransformRequest) {
        const fileContent = await this.createRequirementJsonContent(request)
        const dir = this.getRequirementJsonPath()
        await this.writeRequirmentJsonAsync(dir, JSON.stringify(fileContent))
        this.logging.log('Generated requirement.json at: ' + dir)
    }

    async copySolutionConfigFiles(request: StartTransformRequest) {
        if (request.SolutionConfigPaths && request.SolutionConfigPaths.length > 0) {
            for (const configFilePath of request.SolutionConfigPaths) {
                this.copySourceFile(request.SolutionRootPath, configFilePath)
            }
        }
    }

    copySourceFile(solutionRootPath: string, filePath: string): void {
        const relativePath = this.normalizeSourceFileRelativePath(solutionRootPath, filePath)
        this.copyFile(filePath, this.getWorkspaceCodePathFromRelativePath(relativePath))
    }

    async createRequirementJsonContent(request: StartTransformRequest): Promise<RequirementJson> {
        var projects: Project[] = []
        await request.ProjectMetadata.forEach(async project => {
            const sourceCodeFilePaths = project.SourceCodeFilePaths.filter(filePath => filePath)
            var codeFiles: CodeFile[] = []
            var references: References[] = []

            await sourceCodeFilePaths.forEach(async filePath => {
                try {
                    this.copySourceFile(request.SolutionRootPath, filePath)
                    var contentHash = await this.calculateMD5Async(filePath)
                    var relativePath = this.normalizeSourceFileRelativePath(request.SolutionRootPath, filePath)
                    codeFiles.push({
                        contentMd5Hash: contentHash,
                        relativePath: relativePath,
                    })
                } catch (error) {
                    this.logging.log('Failed to process file: ' + error + filePath)
                }
            })

            project.ExternalReferences.forEach(reference => {
                try {
                    const relativePath = this.normalizeReferenceFileRelativePath(
                        reference.RelativePath,
                        reference.IncludedInArtifact
                    )
                    this.copyFile(
                        reference.AssemblyFullPath,
                        this.getWorkspaceReferencePathFromRelativePath(relativePath)
                    )
                    references.push({
                        includedInArtifact: reference.IncludedInArtifact,
                        relativePath: relativePath,
                    })
                } catch (error) {
                    this.logging.log('Failed to process file: ' + error + reference.AssemblyFullPath)
                }
            })
            projects.push({
                projectFilePath: this.normalizeSourceFileRelativePath(request.SolutionRootPath, project.ProjectPath),
                projectTarget: project.ProjectTargetFramework,
                codeFiles: codeFiles,
                references: references,
            })
        })
        this.logging.log('Total project references: ' + projects.length)
        return {
            EntryPath: this.normalizeSourceFileRelativePath(request.SolutionRootPath, request.SelectedProjectPath),
            SolutionPath: this.normalizeSourceFileRelativePath(request.SolutionRootPath, request.SolutionFilePath),
            Projects: projects,
            TransformNetStandardProjects: request.TransformNetStandardProjects,
        } as RequirementJson
    }

    async zipArtifact(): Promise<string> {
        const folderPath = path.join(this.workspacePath, artifactFolderName)
        if (!fs.existsSync(folderPath)) {
            this.logging.log('Cannot find artifacts folder')
            return ''
        }
        const zipPath = path.join(this.workspacePath, zipFileName)
        this.logging.log('Zipping files to ' + zipPath)
        await this.zipDirectory(folderPath, zipPath)
        return zipPath
    }

    //To read large files in chunks (greater than 2 GiB) using Node.js,
    //use fs.createReadStream() to handle the file in smaller, manageable chunks rather than loading the entire file
    // into memory. This avoids hitting the 2 GiB limit that occurs when using fs.readFile(),
    // as it loads the entire file into memory.
    static async getSha256Async(fileName: string): Promise<string> {
        const hasher = crypto.createHash('sha256')
        const stream = fs.createReadStream(fileName)

        for await (const chunk of stream) {
            hasher.update(chunk)
        }

        return hasher.digest('base64')
    }

    getRequirementJsonPath(): string {
        const dir = path.join(this.workspacePath, artifactFolderName)
        this.createFolderIfNotExist(dir)
        return dir
    }

    getWorkspaceReferencePathFromRelativePath(relativePath: string): string {
        return path.join(this.workspacePath, artifactFolderName, relativePath)
    }

    getWorkspaceCodePathFromRelativePath(relativePath: string): string {
        return path.join(this.workspacePath, artifactFolderName, relativePath)
    }

    normalizeSourceFileRelativePath(solutionRootPath: string, fullPath: string): string {
        if (fullPath.startsWith(solutionRootPath)) {
            return path.join(sourceCodeFolderName, fullPath.replace(`${solutionRootPath}\\`, ''))
        } else {
            const relativePath = fullPath.substring(fullPath.indexOf(':\\') + 2)
            return path.join(sourceCodeFolderName, relativePath)
        }
    }

    normalizeReferenceFileRelativePath(relativePath: string, includedInArtifact: boolean): string {
        return includedInArtifact
            ? path.join(referencesFolderName, relativePath).toLowerCase()
            : relativePath.toLowerCase()
    }

    zipDirectory(sourceDir: string, outPath: string) {
        const archive = archiver('zip', { zlib: { level: 9 } })
        const stream = fs.createWriteStream(outPath)

        return new Promise<void>((resolve, reject) => {
            archive
                .directory(sourceDir, false)
                .on('error', err => reject(err))
                .pipe(stream)

            stream.on('close', () => resolve())
            return archive.finalize()
        })
    }

    async writeRequirmentJsonAsync(dir: string, fileContent: string) {
        const fileName = path.join(dir, requriementJsonFileName)
        fs.writeFileSync(fileName, fileContent)
    }

    createFolderIfNotExist(dir: string) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true })
        }
    }

    copyFile(sourceFilePath: string, destFilePath: string) {
        const dir = path.dirname(destFilePath)
        this.createFolderIfNotExist(dir)
        try {
            fs.copyFileSync(sourceFilePath, destFilePath)
        } catch (err) {
            if (!fs.existsSync(dir) && dir.includes(packagesFolderName)) {
                //Packages folder has been deleted to avoid duplicates in artifacts.zip
                return
            }
            this.logging.log(`Failed to copy from ${sourceFilePath} and error is ${err}`)
        }
    }

    async calculateMD5Async(filePath: string): Promise<string> {
        try {
            const hash = crypto.createHash('md5')
            const stream = fs.createReadStream(filePath)
            for await (const chunk of stream) {
                hash.update(chunk)
            }

            return hash.digest('hex')
        } catch (error) {
            this.logging.log('Failed to calculate hashcode: ' + filePath + error)
            return ''
        }
    }
}
