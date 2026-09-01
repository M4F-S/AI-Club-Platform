# VPS Master Architecture & Connection Protocol

You are an AI assistant managing the VPS at **187.124.2.26**. 
Whenever you are operating in this workspace, you MUST adhere to the architecture and rules defined below.

## 1. Connection Protocol
- **IP Address:** `187.124.2.26`
- **SSH Command:** `ssh -o ConnectTimeout=10 -o BatchMode=yes root@187.124.2.26`
- ALWAYS use this SSH command via the `run_command` tool to interact with the server. Do not assume local paths.

## 2. The Hermes Agent Fleet
The VPS hosts a fleet of Nous Research Hermes agents. They are all running the Mnemosyne v2.0 real-time memory architecture (pgvector database).
Their tools are mounted locally and they run inside Docker containers.

*   **Toy** (`hermes-agent`): The lead technical/coding agent. (Vault: `/root/.hermes/vault`)
*   **Old** (`hermes-assistant`): The general assistant. (Vault: `/opt/hermes-assistant/obsidian-vault`)
*   **Pencil** (`hermes-pentest`): The cybersecurity penetration tester. (Vault: `/opt/hermes-pentest/obsidian-vault`)
*   **Candy** (`hermes-marketing`): The marketing and WooCommerce sync agent. (Vault: `/opt/hermes-marketing/obsidian-vault`)
*   **Coin** (`hermes-trader`): The financial/trading agent. (Vault: `/opt/hermes-trader/obsidian-vault`)

**Agent Management:**
To restart an agent: `docker restart <container-name>`
To view logs: `docker logs --tail 50 <container-name>`

## 3. The ERP System
The VPS also hosts an ERPNext instance (`slc-erp`).
- **Critical Rule:** The live website (WooCommerce) is the **single source of truth**. The ERP is strictly a backend for calculating sales margins and inventory. DO NOT treat the ERP as the master record.
- **Location:** `/opt/slc-erp/`

## 4. Backups and Cron Jobs
- **Local ERP Backups:** `/opt/slc-erp/backups/daily/` (runs at 02:30 AM via cron)
- **Local Agent Backups:** `/root/backups-hermes-*/` (runs at 03:30 AM via cron)
- **Google Drive Cloud Sync:** `rclone` automatically pushes all backups to Google Drive `gdrive:vps-backups` every morning at 04:30 AM via `/root/scripts/sync-to-gdrive.sh`.

## 5. Session Initialization
When you start a new conversation in this project, you should immediately have context of the VPS and the fleet. If the user asks you to "check on Candy," you know exactly how to SSH in, check `docker logs hermes-marketing`, and view her vault.
EOF
'