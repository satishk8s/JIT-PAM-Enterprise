#!/usr/bin/env python3
"""
Create a break-glass user on EC2. Run from backend/ or with backend on PYTHONPATH.
Break-glass users log in with email/password and have full access; they assign Identity Center users as admins/roles.

Usage:
  cd /opt/npamx/app/backend
  sudo -u npamx python3 add_break_glass_user.py

Then enter email and password when prompted.
"""
import os
import sys

# Ensure backend dir is on path so break_glass_db can be imported (run from anywhere)
_script_dir = os.path.dirname(os.path.abspath(__file__))
if _script_dir not in sys.path:
    sys.path.insert(0, _script_dir)
if __name__ == '__main__':
    os.chdir(_script_dir)

from break_glass_db import init_db, add_user, get_user_by_email

def main():
    import re

    init_db()
    email = (os.environ.get('EMAIL') or '').strip().lower()
    if not email or '@' not in email:
        email = input('Break-glass admin email (e.g. admin@company.com): ').strip().lower()
    if not email or '@' not in email:
        print('Error: valid email required.')
        sys.exit(1)
    import getpass
    password = getpass.getpass('Password: ')
    password2 = getpass.getpass('Confirm password: ')
    if password != password2:
        print('Error: passwords do not match.')
        sys.exit(1)
    if len(password) < 14:
        print('Error: password must be at least 14 characters.')
        sys.exit(1)
    if not re.search(r'[A-Z]', password):
        print('Error: password must include at least one uppercase letter.')
        sys.exit(1)
    if not re.search(r'[a-z]', password):
        print('Error: password must include at least one lowercase letter.')
        sys.exit(1)
    if not re.search(r'\d', password):
        print('Error: password must include at least one number.')
        sys.exit(1)
    if not re.search(r'[^A-Za-z0-9]', password):
        print('Error: password must include at least one special character.')
        sys.exit(1)
    if get_user_by_email(email):
        print(f'User {email} already exists. Updating password.')
    ok = add_user(email, password, role='SuperAdmin')
    if ok:
        print(
            f'Break-glass user {email} created/updated. '
            'Complete MFA enrollment from the main NPAMX login using the "Break-glass / Local Admin" path.'
        )
    else:
        print('Error: failed to create user.')
        sys.exit(1)

if __name__ == '__main__':
    main()
