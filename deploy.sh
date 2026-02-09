#!/bin/bash

# Build and push Docker image
docker build -t jit-access .
docker tag jit-access:latest YOUR_ACCOUNT.dkr.ecr.ap-south-1.amazonaws.com/jit-access:latest
aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin YOUR_ACCOUNT.dkr.ecr.ap-south-1.amazonaws.com
docker push YOUR_ACCOUNT.dkr.ecr.ap-south-1.amazonaws.com/jit-access:latest

echo "Choose deployment option:"
echo "1. ECS Fargate"
echo "2. EKS"
read -p "Enter choice (1 or 2): " choice

if [ "$choice" = "1" ]; then
    echo "Deploying to ECS..."
    aws ecs register-task-definition --cli-input-json file://ecs-task-definition.json
    aws ecs create-service --cluster jit-access-cluster --service-name jit-access-service --task-definition jit-access-system --desired-count 2 --launch-type FARGATE --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx,subnet-yyy],securityGroups=[sg-xxx],assignPublicIp=ENABLED}"
elif [ "$choice" = "2" ]; then
    echo "Deploying to EKS..."
    kubectl apply -f k8s-deployment.yaml
else
    echo "Invalid choice"
fi