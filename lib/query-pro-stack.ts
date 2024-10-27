import {
  Stack,
  StackProps,
  aws_s3 as s3,
  aws_sns as sns,
  aws_lambda as lambda,
  aws_iam as iam,
  aws_s3_notifications as s3n,
  aws_dynamodb as dynamodb,
  aws_lambda_event_sources as lambdaEventSources,
  aws_ec2 as ec2,
  aws_elasticloadbalancingv2 as elbv2,
  aws_ecs as ecs,
  aws_sagemaker as sagemaker
} from "aws-cdk-lib";

import { Duration } from "aws-cdk-lib";
import { Period } from "aws-cdk-lib/aws-apigateway";
import * as sqs from "aws-cdk-lib/aws-sqs";
import {
  DynamoEventSource,
  SqsEventSource,
} from "aws-cdk-lib/aws-lambda-event-sources";
import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as sm from "aws-cdk-lib/aws-sagemaker";
import { PublicSubnet } from "aws-cdk-lib/aws-ec2";

export class QueryProStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Define Sagemaker Endpoint
    const endpoint = new sagemaker.CfnEndpoint(this, "SageMakerEndpoint", {
      endpointConfigName: 'sagemaker-epc-1715029537755',
      endpointName: "jumpstart-dft-hf-llm-mixtral-8x7b-instruct-v2", // Replace with your Endpoint Name
      // Additional properties as needed
    });

    // Define the Lambda function
    const myChatbot = new lambda.Function(this, "MyFunction", {
      runtime: lambda.Runtime.PYTHON_3_10, // Choose the runtime environment
      code: lambda.Code.fromAsset("Lambda"), // Specify the directory of your Lambda code
      handler: "chatbot.handler", // File and method name (index.js and exports.handler)
    });

    // Define the IAM policy statements for the necessary services
    const policyStatement = new iam.PolicyStatement({
      actions: [
        "s3:*", // Adjust according to your needs
        "dynamodb:*", // Adjust according to your needs
        "sagemaker:*", // Adjust according to your needs
      ],
      resources: ["*"], // It's recommended to specify more restrictive resource ARNs
    });

    // Attach the policy to the Lambda function
    myChatbot.addToRolePolicy(policyStatement);

    // Create an S3 bucket
    const myBucket = new s3.Bucket(this, "MyBucket", {
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // NOT recommended for production code
    });

    // S3 sns topic from S3->SNS->SQS  step 1
    const s3_topic = new sns.Topic(
      this,
      "uploaded-step-1-prod-query-pro-dev-v6-v2-s3-sns-topic"
    );
    // S3 queue from S3->SNS->SQS  step 2
    const s3_queue = new sqs.Queue(
      this,
      "uploaded-step-2-prod-query-pro-dev-v6-v2-s3-sqs-queue",
      {
        retentionPeriod: cdk.Duration.days(10),
        visibilityTimeout: cdk.Duration.seconds(1000),
      }
    );
    // adding s3 queue to s3 sns topic
    // subscribe queue to topic
    s3_topic.addSubscription(new subs.SqsSubscription(s3_queue));

    //dynamoDB
    const table = new dynamodb.Table(this, "caseDetailsTable", {
      partitionKey: { name: "CaseNumber", type: dynamodb.AttributeType.STRING },
      tableName: "caseDetailsTableV2", // Updated name
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    // Create an S3 bucket

    // Define an IAM role for Lambda
    const lambdaRole = new iam.Role(this, "LambdaExecutionRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole"
        ),
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaVPCAccessExecutionRole"
        ),
      ],
    });

    // Lambda Function Triggered by S3 Upload

    // notification topic sfter the job is complete it will be trigered by textract
    const notification_topic = new sns.Topic(
      this,
      "dev-blocks-textract-sns-topic-v6-v2"
    );
    // role of textract
    const textractServiceRole = new iam.Role(this, "TextractServiceRole", {
      assumedBy: new iam.ServicePrincipal("textract.amazonaws.com"),
    });
    textractServiceRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        resources: [notification_topic.topicArn],
        actions: ["sns:Publish"],
      })
    );
    // S3 pipeline to extract text
    const textract_func = new lambda.Function(this, "s3Trigger", {
      runtime: lambda.Runtime.PYTHON_3_10,
      code: lambda.Code.fromAsset("Lambda"),
      handler: "s3Trigger.handler",
      timeout: Duration.minutes(15),
      environment: {
        SNS_TOPIC_ARN: notification_topic.topicArn,
        TEXTRACT_ROLE_ARN: textractServiceRole.roleArn,
        BUCKET_NAME: myBucket.bucketName,
      },
    });

    textract_func.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "logs:*",
          "apigateway:*",
          "s3:*",
          "textract:*",
          "sns:*",
          "sqs:*",
          "dynamodb:*",
          "bedrock:*",
          "sagemaker:InvokeEndpoint",
        ],
        resources: ["*"],
      })
    );
    // textract_func triggered by s3_queue that is connected by S3 topic upload
    textract_func.addEventSource(new SqsEventSource(s3_queue));
    // Queue that will be used by Complete Job Textract
    const s3_textrract_complete_queue = new sqs.Queue(
      this,
      "query_pro-dev-v6-v2-s3-textrract-complete-sqs-queue",
      {
        retentionPeriod: cdk.Duration.days(10),
        visibilityTimeout: cdk.Duration.seconds(1000),
      }
    );

    // Set S3 upload as an event source for the Lambda function
    // adding SNS to S3 object created notification with suffix filters
    myBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.SnsDestination(s3_topic),
      {
        suffix: ".pdf",
      }
    );
    // notificatin SNS topic subsciption to s3_textrract_complete_queue
    notification_topic.addSubscription(
      new subs.SqsSubscription(s3_textrract_complete_queue)
    );
    // s3_textrract_complete_queue as event source for lambda function
    // lambda function
    const textract_complete_func = new lambda.Function(
      this,
      "query_pro_prod_dev_v6_v2_textract_complete_func",
      {
        runtime: lambda.Runtime.PYTHON_3_10,
        code: lambda.Code.fromAsset("Lambda"),
        handler: "snsTrigger.handler",
        timeout: Duration.minutes(15),
        environment: {
          BUCKET_NAME: myBucket.bucketName,
          SAGEMAKER_ENDPOINT_NAME:
            "jumpstart-dft-hf-llm-mixtral-8x7b-instruct-v2",
        },
      }
    );
    textract_complete_func.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "logs:*",
          "apigateway:*",
          "s3:*",
          "textract:*",
          "sns:*",
          "sqs:*",
          "dynamodb:*",
          "bedrock:*",
          "sagemaker:InvokeEndpoint",
        ],
        resources: ["*"],
      })
    );
    // adding trigger from the SQS that is triggered from SNS topic of completion
    textract_complete_func.addEventSource(
      new SqsEventSource(s3_textrract_complete_queue)
    );

    const ecrRepoNameParam = new cdk.CfnParameter(this, 'ECRRepoName', {
      type: 'String',
      description: 'Name of the ECR repository',
    });

    const vpc_2 = new ec2.Vpc(this, "Vpc_mcao", {
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          name: "public_sub",
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
    })

    const egressOnlyGateway = new ec2.CfnEgressOnlyInternetGateway(this, 'project321-eigw', {
      vpcId: vpc_2.vpcId,
    });

    vpc_2.addGatewayEndpoint('S3GatewayEndpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
      subnets: [{ subnetType: ec2.SubnetType.PUBLIC }],  // Public subnets will have access to S3 via this endpoint
    });


    const security_group2 = new ec2.SecurityGroup(this, "mcao_security_group2", {
      vpc: vpc_2,
      allowAllOutbound: true,
      allowAllIpv6Outbound: true,
      description: "mcao_security_group2",
      securityGroupName: "mcao_security_group2",
    });

    security_group2.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.allTraffic(),
      "Allow access to all ports"
    );

    security_group2.addIngressRule(
      ec2.Peer.anyIpv6(),
      ec2.Port.allTraffic(),
      "Allow access to all ports"
    );

    // Import existing load balancer
    const alb = new elbv2.ApplicationLoadBalancer(this, 'MyALB', {
      vpc: vpc_2,
      internetFacing: true,  // This ALB is publicly accessible
      loadBalancerName: 'mcao-lb',
      securityGroup: security_group2,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,  // This ALB will be in public subnets
      },
    });


    const cluster = new ecs.Cluster(this, "EcsCluster", {
      vpc:vpc_2,
      clusterName: "mcao_cluster",
    });

    const taskRole = new iam.Role(this, "TaskRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonEC2ContainerServiceforEC2Role"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonEC2ContainerServiceRole"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonECS_FullAccess"),
      ],
    });

    const executionRole = new iam.Role(this, "ExecutionRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("EC2InstanceProfileForImageBuilderECRContainerBuilds"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonECSTaskExecutionRolePolicy"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonBedrockFullAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonS3FullAccess"),
      ],
    });

    const taskDefinition = new ecs.FargateTaskDefinition(this, "TaskDef", {
      memoryLimitMiB: 3072,
      cpu: 1024,
      taskRole,
      executionRole,
      runtimePlatform: {
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
      },
    });

    const container = taskDefinition.addContainer("mcao-streamlit", {
      image: ecs.ContainerImage.fromRegistry(ecrRepoNameParam.valueAsString),
      memoryLimitMiB: 3072,
      cpu: 1024,
      logging: ecs.LogDriver.awsLogs({ streamPrefix: "mcao" }),
      
    });

    container.addPortMappings({
      containerPort: 8501,
    });

    const targetGroup = new elbv2.ApplicationTargetGroup(this, 'MyTargetGroup', {
      vpc: vpc_2,
      port: 8501,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP
    });

    
    // Import existing listener
    const listener = alb.addListener('Listener', {
      port: 8501,
      protocol: elbv2.ApplicationProtocol.HTTP,
      open: true,  // Allows traffic from anywhere
      defaultTargetGroups: [targetGroup],
    });

    const fargateService = new ecs.FargateService(this, "ECSService", {
      cluster,
      taskDefinition,
      desiredCount: 1,
      serviceName: "mcao-service",
      securityGroups: [security_group2],
      assignPublicIp: true,
      // Assign public subnet
      vpcSubnets: {

          // This ALB will be in public subnets
      },
      healthCheckGracePeriod: cdk.Duration.seconds(60)
    });
    fargateService.attachToApplicationTargetGroup(targetGroup);

    // new cdk.CfnOutput(this, "LoadBalancerDNS", {
    //   value: alb.loadBalancerDnsName,
    //   description: "DNS name of the load balancer",
    // });

    // Output the name of the S3 bucket
    new cdk.CfnOutput(this, 'BucketName', {
      value: myBucket.bucketName,
    });
  }
}
