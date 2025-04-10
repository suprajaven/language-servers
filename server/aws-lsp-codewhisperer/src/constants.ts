export const DEFAULT_AWS_Q_ENDPOINT_URL = 'https://codewhisperer.us-east-1.amazonaws.com/'
export const DEFAULT_AWS_Q_REGION = 'us-east-1'

export const AWS_Q_ENDPOINTS = {
    [DEFAULT_AWS_Q_REGION]: DEFAULT_AWS_Q_ENDPOINT_URL,
    'eu-central-1': 'https://q.eu-central-1.amazonaws.com/',
}

export const AWS_Q_REGION_ENV_VAR = 'AWS_Q_REGION'
export const AWS_Q_ENDPOINT_URL_ENV_VAR = 'AWS_Q_ENDPOINT_URL'
