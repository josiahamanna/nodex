// Release deploy: checkout → optional npm ci (ignore-scripts) → docker full deploy.
// Prerequisites: deploy/jenkins/README.md (Docker, Node 22 or NVM, bash).

pipeline {
    agent any

    options {
        timestamps()
    }

    parameters {
        booleanParam(
            name: 'RUN_NPM_CI',
            defaultValue: false,
            description: 'Run npm ci --ignore-scripts before deploy (optional; avoids Electron postinstall on the agent)'
        )
    }

    // Uncomment after creating credentials in Jenkins (see deploy/jenkins/README.md):
    // environment {
    //     NODEX_AUTH_JWT_SECRET = credentials('nodex-auth-jwt-secret')
    //     NODEX_PG_PASSWORD = credentials('nodex-pg-password')
    // }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Install') {
            when {
                expression { return params.RUN_NPM_CI }
            }
            steps {
                sh 'bash scripts/jenkins-with-node22.sh npm ci --ignore-scripts'
            }
        }

        stage('Deploy') {
            steps {
                sh 'bash scripts/jenkins-with-node22.sh npm run deploy -- --stop-old'
            }
        }
    }
}
