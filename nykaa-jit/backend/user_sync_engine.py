# User Sync Engine - Sync users and groups from AD or AWS Identity Center

import boto3
from datetime import datetime

class UserSyncEngine:
    """
    Syncs users and groups from external identity sources
    Supports: Active Directory, AWS Identity Center
    """
    
    @staticmethod
    def sync_from_identity_center(identity_store_id):
        """
        Sync users and groups from AWS Identity Center
        Returns: (users, groups, sync_status)
        """
        try:
            identitystore = boto3.client('identitystore', region_name='ap-south-1')
            
            # Sync Users
            users = []
            paginator = identitystore.get_paginator('list_users')
            for page in paginator.paginate(IdentityStoreId=identity_store_id):
                for user in page['Users']:
                    users.append({
                        'user_id': user['UserId'],
                        'username': user['UserName'],
                        'email': user.get('Emails', [{}])[0].get('Value', ''),
                        'display_name': user.get('DisplayName', ''),
                        'first_name': user.get('Name', {}).get('GivenName', ''),
                        'last_name': user.get('Name', {}).get('FamilyName', ''),
                        'source': 'identity_center',
                        'synced_at': datetime.now().isoformat()
                    })
            
            # Sync Groups
            groups = []
            group_paginator = identitystore.get_paginator('list_groups')
            for page in group_paginator.paginate(IdentityStoreId=identity_store_id):
                for group in page['Groups']:
                    # Get group members
                    members = []
                    member_paginator = identitystore.get_paginator('list_group_memberships')
                    for member_page in member_paginator.paginate(
                        IdentityStoreId=identity_store_id,
                        GroupId=group['GroupId']
                    ):
                        members.extend([m['MemberId']['UserId'] for m in member_page['GroupMemberships']])
                    
                    groups.append({
                        'group_id': group['GroupId'],
                        'group_name': group['DisplayName'],
                        'description': group.get('Description', ''),
                        'members': members,
                        'member_count': len(members),
                        'source': 'identity_center',
                        'synced_at': datetime.now().isoformat()
                    })
            
            return users, groups, {
                'status': 'success',
                'users_synced': len(users),
                'groups_synced': len(groups),
                'timestamp': datetime.now().isoformat()
            }
            
        except Exception as e:
            return [], [], {
                'status': 'error',
                'error': str(e),
                'timestamp': datetime.now().isoformat()
            }
    
    @staticmethod
    def sync_from_active_directory(ad_config):
        """
        Sync users and groups from Active Directory
        
        ad_config: {
            'domain': 'company.local',
            'ldap_url': 'ldap://dc.company.local',
            'bind_dn': 'CN=Service Account,OU=Users,DC=company,DC=local',
            'bind_password': 'password',
            'user_base_dn': 'OU=Users,DC=company,DC=local',
            'group_base_dn': 'OU=Groups,DC=company,DC=local'
        }
        """
        try:
            # This requires ldap3 library
            # pip install ldap3
            from ldap3 import Server, Connection, ALL, SUBTREE
            
            server = Server(ad_config['ldap_url'], get_info=ALL)
            conn = Connection(
                server,
                user=ad_config['bind_dn'],
                password=ad_config['bind_password'],
                auto_bind=True
            )
            
            # Sync Users
            users = []
            conn.search(
                search_base=ad_config['user_base_dn'],
                search_filter='(&(objectClass=user)(!(objectClass=computer)))',
                search_scope=SUBTREE,
                attributes=['sAMAccountName', 'mail', 'displayName', 'givenName', 'sn', 'memberOf']
            )
            
            for entry in conn.entries:
                users.append({
                    'user_id': str(entry.sAMAccountName),
                    'username': str(entry.sAMAccountName),
                    'email': str(entry.mail) if entry.mail else '',
                    'display_name': str(entry.displayName) if entry.displayName else '',
                    'first_name': str(entry.givenName) if entry.givenName else '',
                    'last_name': str(entry.sn) if entry.sn else '',
                    'groups': [g.split(',')[0].replace('CN=', '') for g in entry.memberOf] if entry.memberOf else [],
                    'source': 'active_directory',
                    'synced_at': datetime.now().isoformat()
                })
            
            # Sync Groups
            groups = []
            conn.search(
                search_base=ad_config['group_base_dn'],
                search_filter='(objectClass=group)',
                search_scope=SUBTREE,
                attributes=['cn', 'description', 'member']
            )
            
            for entry in conn.entries:
                members = []
                if entry.member:
                    for member_dn in entry.member:
                        # Extract username from DN
                        member_cn = member_dn.split(',')[0].replace('CN=', '')
                        members.append(member_cn)
                
                groups.append({
                    'group_id': str(entry.cn),
                    'group_name': str(entry.cn),
                    'description': str(entry.description) if entry.description else '',
                    'members': members,
                    'member_count': len(members),
                    'source': 'active_directory',
                    'synced_at': datetime.now().isoformat()
                })
            
            conn.unbind()
            
            return users, groups, {
                'status': 'success',
                'users_synced': len(users),
                'groups_synced': len(groups),
                'timestamp': datetime.now().isoformat()
            }
            
        except ImportError:
            return [], [], {
                'status': 'error',
                'error': 'ldap3 library not installed. Run: pip install ldap3',
                'timestamp': datetime.now().isoformat()
            }
        except Exception as e:
            return [], [], {
                'status': 'error',
                'error': str(e),
                'timestamp': datetime.now().isoformat()
            }
    
    @staticmethod
    def push_to_identity_center(identity_store_id, users, groups):
        """
        Push manually created users/groups to AWS Identity Center
        """
        try:
            identitystore = boto3.client('identitystore', region_name='ap-south-1')
            
            created_users = []
            created_groups = []
            
            # Create users
            for user in users:
                try:
                    response = identitystore.create_user(
                        IdentityStoreId=identity_store_id,
                        UserName=user['username'],
                        Name={
                            'GivenName': user.get('first_name', ''),
                            'FamilyName': user.get('last_name', '')
                        },
                        DisplayName=user.get('display_name', user['username']),
                        Emails=[{'Value': user['email'], 'Type': 'work', 'Primary': True}]
                    )
                    created_users.append(response['UserId'])
                except Exception as e:
                    print(f"Error creating user {user['username']}: {e}")
            
            # Create groups
            for group in groups:
                try:
                    response = identitystore.create_group(
                        IdentityStoreId=identity_store_id,
                        DisplayName=group['group_name'],
                        Description=group.get('description', '')
                    )
                    created_groups.append(response['GroupId'])
                except Exception as e:
                    print(f"Error creating group {group['group_name']}: {e}")
            
            return {
                'status': 'success',
                'users_created': len(created_users),
                'groups_created': len(created_groups),
                'timestamp': datetime.now().isoformat()
            }
            
        except Exception as e:
            return {
                'status': 'error',
                'error': str(e),
                'timestamp': datetime.now().isoformat()
            }
    
    @staticmethod
    def push_to_active_directory(ad_config, users, groups):
        """
        Push manually created users/groups to Active Directory
        """
        try:
            from ldap3 import Server, Connection, ALL, MODIFY_ADD
            
            server = Server(ad_config['ldap_url'], get_info=ALL)
            conn = Connection(
                server,
                user=ad_config['bind_dn'],
                password=ad_config['bind_password'],
                auto_bind=True
            )
            
            created_users = []
            created_groups = []
            
            # Create users in AD
            for user in users:
                user_dn = f"CN={user['display_name']},{ad_config['user_base_dn']}"
                try:
                    conn.add(
                        user_dn,
                        ['user'],
                        {
                            'sAMAccountName': user['username'],
                            'mail': user['email'],
                            'givenName': user.get('first_name', ''),
                            'sn': user.get('last_name', ''),
                            'displayName': user.get('display_name', user['username'])
                        }
                    )
                    created_users.append(user['username'])
                except Exception as e:
                    print(f"Error creating AD user {user['username']}: {e}")
            
            # Create groups in AD
            for group in groups:
                group_dn = f"CN={group['group_name']},{ad_config['group_base_dn']}"
                try:
                    conn.add(
                        group_dn,
                        ['group'],
                        {
                            'cn': group['group_name'],
                            'description': group.get('description', '')
                        }
                    )
                    created_groups.append(group['group_name'])
                except Exception as e:
                    print(f"Error creating AD group {group['group_name']}: {e}")
            
            conn.unbind()
            
            return {
                'status': 'success',
                'users_created': len(created_users),
                'groups_created': len(created_groups),
                'timestamp': datetime.now().isoformat()
            }
            
        except Exception as e:
            return {
                'status': 'error',
                'error': str(e),
                'timestamp': datetime.now().isoformat()
            }
