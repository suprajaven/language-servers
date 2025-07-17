import { TestFeatures } from '@aws/language-server-runtimes/testing'
import { QChatTriggerContext } from './triggerContext'
import assert = require('assert')
import sinon = require('sinon')

describe('QChatTriggerContext - Inline Chat Extra Context', () => {
    let testFeatures: TestFeatures
    let amazonQServiceManager: any
    let triggerContext: QChatTriggerContext

    beforeEach(() => {
        testFeatures = new TestFeatures()
        amazonQServiceManager = {
            getConfiguration: sinon.stub(),
        }
        triggerContext = new QChatTriggerContext(testFeatures.workspace, testFeatures.logging, amazonQServiceManager)
    })

    afterEach(() => {
        sinon.restore()
    })

    it('should add extra context as markdown document for inline chat', async () => {
        // Arrange
        const extraContextString = 'This is extra context for inline chat'
        const mockConfig = {
            inlineChat: {
                extraContext: extraContextString,
            },
        }

        amazonQServiceManager.getConfiguration.returns(mockConfig)

        const params = {
            prompt: {
                prompt: 'Explain this code',
                escapedPrompt: 'Explain this code',
            },
            textDocument: {
                uri: 'file:///test.ts',
            },
            cursorState: [{ position: { line: 0, character: 0 } }],
        }

        // Act
        const result = await triggerContext.getNewTriggerContext(params)

        // Assert
        assert.strictEqual(result.useRelevantDocuments, true)
        assert.strictEqual(result.relevantDocuments?.length, 1)
        assert.deepStrictEqual(result.relevantDocuments![0], {
            relativeFilePath: 'extra-context.md',
            programmingLanguage: {
                languageName: 'markdown',
            },
            text: extraContextString,
        })
    })

    it('should not add extra context when it is empty', async () => {
        // Arrange
        const mockConfig = {
            inlineChat: {
                extraContext: '',
            },
        }

        amazonQServiceManager.getConfiguration.returns(mockConfig)

        const params = {
            prompt: {
                prompt: 'Explain this code',
                escapedPrompt: 'Explain this code',
            },
            textDocument: {
                uri: 'file:///test.ts',
            },
            cursorState: [{ position: { line: 0, character: 0 } }],
        }

        // Act
        const result = await triggerContext.getNewTriggerContext(params)

        // Assert
        assert.strictEqual(result.relevantDocuments?.length, 0)
    })

    it('should not add extra context when not inline chat (no textDocument)', async () => {
        // Arrange
        const extraContextString = 'This is extra context for inline chat'
        const mockConfig = {
            inlineChat: {
                extraContext: extraContextString,
            },
        }

        amazonQServiceManager.getConfiguration.returns(mockConfig)

        const params = {
            prompt: {
                prompt: 'Explain this code',
                escapedPrompt: 'Explain this code',
            },
            // No textDocument - this is regular chat, not inline chat
        }

        // Act
        const result = await triggerContext.getNewTriggerContext(params as any)

        // Assert
        assert.strictEqual(result.relevantDocuments?.length, 0)
    })

    it('should not add extra context when amazonQServiceManager is not available', async () => {
        // Arrange
        const triggerContextWithoutManager = new QChatTriggerContext(
            testFeatures.workspace,
            testFeatures.logging
            // No amazonQServiceManager
        )

        const params = {
            prompt: {
                prompt: 'Explain this code',
                escapedPrompt: 'Explain this code',
            },
            textDocument: {
                uri: 'file:///test.ts',
            },
            cursorState: [{ position: { line: 0, character: 0 } }],
        }

        // Act
        const result = await triggerContextWithoutManager.getNewTriggerContext(params)

        // Assert
        assert.strictEqual(result.relevantDocuments?.length, 0)
    })
})
