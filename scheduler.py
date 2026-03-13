#!/usr/bin/env python3
"""
JIT Access Scheduler - Auto-removes expired access and cleans up old requests
Run this as a cron job every 15 minutes: */15 * * * * python scheduler.py
"""
import boto3
import json
from datetime import datetime, timedelta
import requests
import os
from dotenv import load_dotenv

load_dotenv()

# Configuration: use env in production so scheduler can call API with auth
API_BASE = os.environ.get('JIT_SCHEDULER_API_BASE', 'http://localhost:5000/api').rstrip('/')
# Optional: API key for scheduler-to-API auth (set JIT_SCHEDULER_API_KEY in env; backend must accept X-API-Key or similar)
SCHEDULER_API_KEY = os.environ.get('JIT_SCHEDULER_API_KEY', '').strip()

def get_all_requests():
    """Get all requests from the API (scheduler runs server-side; use session cookie or API key if auth required)."""
    try:
        headers = {}
        if SCHEDULER_API_KEY:
            headers['X-API-Key'] = SCHEDULER_API_KEY
        response = requests.get(f'{API_BASE}/requests', headers=headers, timeout=30)
        return response.json() if response.ok else []
    except Exception as e:
        print(f"Error fetching requests: {e}")
        return []

def revoke_expired_access():
    """Auto-revoke expired approved access"""
    print("🔍 Checking for expired access...")
    requests_list = get_all_requests()
    now = datetime.now()
    
    expired_count = 0
    for request in requests_list:
        if request['status'] == 'approved':
            expires_at = datetime.fromisoformat(request['expires_at'].replace('Z', ''))
            
            if now > expires_at:
                print(f"⏰ Revoking expired access: {request['id'][:8]}... (expired {expires_at})")
                
                try:
                    headers = {'Content-Type': 'application/json'}
                    if SCHEDULER_API_KEY:
                        headers['X-API-Key'] = SCHEDULER_API_KEY
                    response = requests.post(
                        f"{API_BASE}/request/{request['id']}/revoke",
                        json={'reason': 'Automatic expiration - JIT access expired'},
                        headers=headers,
                        timeout=30
                    )
                    
                    if response.status_code == 200:
                        print(f"✅ Successfully revoked: {request['id'][:8]}...")
                        expired_count += 1
                    else:
                        print(f"❌ Failed to revoke: {response.json()}")
                        
                except Exception as e:
                    print(f"❌ Error revoking {request['id'][:8]}...: {e}")
    
    print(f"🎯 Revoked {expired_count} expired access grants")
    return expired_count

def cleanup_old_requests():
    """Delete requests older than 3 days with inactive status"""
    print("🧹 Cleaning up old inactive requests...")
    requests_list = get_all_requests()
    now = datetime.now()
    cutoff_date = now - timedelta(days=3)
    
    cleaned_count = 0
    for request in requests_list:
        created_at = datetime.fromisoformat(request['created_at'].replace('Z', ''))
        
        # Delete if older than 3 days and not approved
        if created_at < cutoff_date and request['status'] in ['pending', 'denied']:
            print(f"🗑️ Deleting old inactive request: {request['id'][:8]}... (created {created_at.strftime('%Y-%m-%d')})")
            
            try:
                headers = {}
                if SCHEDULER_API_KEY:
                    headers['X-API-Key'] = SCHEDULER_API_KEY
                response = requests.delete(f"{API_BASE}/request/{request['id']}/delete", headers=headers, timeout=30)
                
                if response.status_code == 200:
                    print(f"✅ Successfully deleted: {request['id'][:8]}...")
                    cleaned_count += 1
                else:
                    print(f"❌ Failed to delete: {response.json()}")
                    
            except Exception as e:
                print(f"❌ Error deleting {request['id'][:8]}...: {e}")
    
    print(f"🎯 Cleaned up {cleaned_count} old inactive requests")
    return cleaned_count

def main():
    print("🚀 JIT Access Scheduler Starting...")
    print(f"⏰ Current time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # 1. Revoke expired access
    expired_count = revoke_expired_access()
    
    # 2. Clean up old requests
    cleaned_count = cleanup_old_requests()
    
    print(f"✅ Scheduler completed: {expired_count} expired, {cleaned_count} cleaned")
    
    # Log to file for monitoring
    with open('/tmp/jit_scheduler.log', 'a') as f:
        f.write(f"{datetime.now().isoformat()}: expired={expired_count}, cleaned={cleaned_count}\n")

if __name__ == "__main__":
    main()