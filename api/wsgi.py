"""WSGI entry point for 42 Berlin AI Club API."""
from waitress import serve

from app import app
from config import Config

if __name__ == "__main__":
    serve(app, host="0.0.0.0", port=5000, threads=8)
