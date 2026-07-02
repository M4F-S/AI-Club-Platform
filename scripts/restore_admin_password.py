import bcrypt
import sqlite3
import sys

DB_PATH = "/opt/sophia-shopper/landing/ai-club/data/ai-club.db"
PASSWORD = "M1234567890"
USER_ID = 1

def main():
    hashed = bcrypt.hashpw(PASSWORD.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")
    print(f"New hash generated (first 20 chars): {hashed[:20]}...")
    
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    
    # Show old hash
    cur.execute("SELECT password_hash FROM users WHERE id = ?", (USER_ID,))
    old = cur.fetchone()
    if old:
        print(f"Old hash (first 20 chars): {old[0][:20]}...")
    else:
        print("User not found!")
        sys.exit(1)
    
    cur.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hashed, USER_ID))
    conn.commit()
    
    # Verify
    cur.execute("SELECT password_hash FROM users WHERE id = ?", (USER_ID,))
    new = cur.fetchone()
    print(f"Updated hash (first 20 chars): {new[0][:20]}...")
    
    # Verify bcrypt check
    assert bcrypt.checkpw(PASSWORD.encode("utf-8"), new[0].encode("utf-8")), "Hash verification failed!"
    print("Hash verification OK: password matches.")
    
    conn.close()

if __name__ == "__main__":
    main()
