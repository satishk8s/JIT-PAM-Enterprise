import boto3
from dotenv import load_dotenv

load_dotenv()

# Test SSO API directly
sso_admin = boto3.client('sso-admin', region_name='us-east-1')

try:
    # List instances
    instances = sso_admin.list_instances()
    print(f"Instances: {instances}")
    
    if instances['Instances']:
        instance_arn = instances['Instances'][0]['InstanceArn']
        print(f"Using instance: {instance_arn}")
        
        # Test permission sets
        response = sso_admin.list_permission_sets(
            InstanceArn=instance_arn,
            MaxResults=10
        )
        print(f"Permission sets response: {response}")
        print(f"Count: {len(response.get('PermissionSets', []))}")
        print(f"Has NextToken: {'NextToken' in response}")
        
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()