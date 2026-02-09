#!/bin/bash

# Create virtual environment
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate

# Install dependencies
pip install -r backend/requirements.txt

echo "Setup complete! Now run:"
echo "source venv/bin/activate"
echo "python backend/app.py"