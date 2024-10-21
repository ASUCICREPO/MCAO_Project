# Welcome to your CDK TypeScript project

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* `npx cdk diff`    compare deployed stack with the current state
* `npx cdk synth`   emits the synthesized CloudFormation template

# Prerequisites 

- Have access to the Hugging Face Mistral 8x7B Instruct in Sagemaker
  
# MCAO Commands

# Deploy CDK

```
git clone https://github.com/ASUCICREPO/MCAO_Project.git
cd MCAO_Project

cdk bootstrap
cdk synth
cdk deploy
```

# Frontend Changes

- Replace the 'functionName' value with the created Lambda Function in Frontend/InvokeLambda.py
- Replace the 'BUCKET_NAME' value with the bucket name containing all the Police Report PDFs in Frontend/utils.py

# Run Application

```
cd MCAO_Project/Frontend
pip install -r requirements.txt
streamlit run app.py
```
