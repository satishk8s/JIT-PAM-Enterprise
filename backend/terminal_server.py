import asyncio
import websockets
import paramiko
import json

async def ssh_handler(websocket):
    """Handle WebSocket SSH connections"""
    try:
        # Parse connection parameters from URL
        path = websocket.request.path
        print(f"Connection path: {path}")
        params = dict(param.split('=') for param in path.split('?')[1].split('&')) if '?' in path else {}
        print(f"Parsed params: {params}")
        
        from urllib.parse import unquote
        host = unquote(params.get('host', ''))
        username = unquote(params.get('username', ''))
        password = unquote(params.get('password', ''))
        print(f"Connecting to {username}@{host} with password: {password[:2]}***")
        
        if not all([host, username, password]):
            await websocket.send('\r\n\x1b[31mError: Missing credentials\x1b[0m\r\n')
            return
        
        # Create SSH client
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        
        try:
            # Connect to SSH server
            print(f"Attempting SSH connection...")
            ssh.connect(host, username=username, password=password, timeout=10, look_for_keys=False, allow_agent=False)
            print(f"SSH connection successful!")
            
            # Open interactive shell
            channel = ssh.invoke_shell(term='xterm', width=80, height=24)
            
            await websocket.send('\r\n\x1b[32mConnected successfully!\x1b[0m\r\n\r\n')
            
            # Handle bidirectional communication
            async def read_ssh():
                while True:
                    if channel.recv_ready():
                        data = channel.recv(1024).decode('utf-8', errors='ignore')
                        await websocket.send(data)
                    await asyncio.sleep(0.01)
            
            async def write_ssh():
                async for message in websocket:
                    channel.send(message)
            
            # Run both tasks concurrently
            await asyncio.gather(read_ssh(), write_ssh())
            
        except paramiko.AuthenticationException as e:
            print(f"Authentication failed: {e}")
            await websocket.send('\r\n\x1b[31mAuthentication failed. Check username/password.\x1b[0m\r\n')
        except Exception as e:
            print(f"Connection error: {e}")
            await websocket.send(f'\r\n\x1b[31mConnection error: {str(e)}\x1b[0m\r\n')
        finally:
            ssh.close()
            
    except Exception as e:
        print(f"Error: {e}")
        try:
            await websocket.send(f'\r\n\x1b[31mError: {str(e)}\x1b[0m\r\n')
        except:
            pass

async def main():
    print("🚀 Terminal WebSocket server starting on ws://127.0.0.1:5001")
    async with websockets.serve(ssh_handler, "127.0.0.1", 5001):
        await asyncio.Future()  # Run forever

if __name__ == "__main__":
    asyncio.run(main())
