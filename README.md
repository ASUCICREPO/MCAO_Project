## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* `npx cdk diff`    compare deployed stack with the current state
* `npx cdk synth`   emits the synthesized CloudFormation template

## Helpful notes

- You might need to have your docker application open to push the image
- You can avoid using the "--profile" parameter if your profile is globally setup

# Prerequisites 

- Have access to the Hugging Face Mistral 8x7B Instruct in Sagemaker

# MCAO Setup Instructions

Create a new ECR Registry

**Container instructions to push docker image**

```
git clone https://github.com/ASUCICREPO/MCAO_Project.git
cd MCAO_Project/Frontend
```
- Click on your created ECR Registry and Click "View push commands"
- Follow the mentioned commands in order
- Store the ECR URI

# Deploy CDK

```
cdk bootstrap --parameters ECRRepoName=<ECR-URI>
cdk synth --parameters ECRRepoName=<ECR-URI>
cdk deploy --parameters ECRRepoName=<ECR-URI>
```

# Instructions to use if running streamlit manually

## Frontend Changes

- Replace the 'functionName' value with the created Lambda Function in Frontend/InvokeLambda.py
- Replace the 'BUCKET_NAME' value with the bucket name containing all the Police Report PDFs in Frontend/utils.py

## Run Application

```
cd MCAO_Project/Frontend
pip install -r requirements.txt
streamlit run app.py
```
