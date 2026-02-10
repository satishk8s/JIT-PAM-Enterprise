# Run this on the proxy EC2 (172.11.133.53)

You already ran the directory and venv steps but the **proxy code files were missing**. Use either method below.

---

## Method 1: Copy setup script from your laptop and run (easiest)

**On your laptop** (where you have the `nykaa-jit` repo):

```bash
cd /path/to/nykaa-jit
scp -i your-key.pem proxy-server/setup-on-server.sh root@172.11.133.53:/tmp/
ssh -i your-key.pem root@172.11.133.53 'bash /tmp/setup-on-server.sh'
```

Then **on the proxy server** (SSH in and run):

```bash
sudo cp /opt/db-proxy/db-proxy.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable db-proxy
sudo systemctl start db-proxy
curl -s http://127.0.0.1:5002/health
```

You should see `{"status":"ok","service":"database-proxy"}`.

---

## Method 2: You are already on the proxy server (no SCP)

**1.** Create the setup script by pasting it. On the proxy server run:

```bash
nano /tmp/setup-on-server.sh
```

Open the file **`proxy-server/setup-on-server.sh`** from the repo (in Cursor/IDE), copy its **entire contents**, paste into `nano`, then save (Ctrl+O, Enter, Ctrl+X).

**2.** Run the script and install the service:

```bash
bash /tmp/setup-on-server.sh
sudo cp /opt/db-proxy/db-proxy.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable db-proxy
sudo systemctl start db-proxy
curl -s http://127.0.0.1:5002/health
```

---

## If something fails

- **pip install fails:** `cd /opt/db-proxy && source venv/bin/activate && pip install -r requirements.txt`
- **Service fails to start:** `sudo journalctl -u db-proxy -n 50`
- **Port in use:** `sudo lsof -i :5002` then stop the process or change `DB_PROXY_PORT` in the service file.
