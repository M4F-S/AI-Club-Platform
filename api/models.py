"""Database models for 42 Berlin AI Club API."""
from datetime import datetime, timezone
from flask_sqlalchemy import SQLAlchemy
db = SQLAlchemy()
def utcnow(): return datetime.now(timezone.utc)

class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    intra_username = db.Column(db.String(64), unique=True, nullable=True, index=True)
    name = db.Column(db.String(255), nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(32), nullable=False, default="member")
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=utcnow, onupdate=utcnow)
    password_reset_token = db.Column(db.String(255), nullable=True, index=True)
    password_reset_expires_at = db.Column(db.DateTime, nullable=True)
    def to_dict(self, include_email=False):
        d = {"id": self.id, "intra_username": self.intra_username, "name": self.name,
             "role": self.role, "is_active": self.is_active,
             "created_at": self.created_at.isoformat() if self.created_at else None}
        if include_email: d["email"] = self.email
        return d

class Application(db.Model):
    __tablename__ = "applications"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    intra_username = db.Column(db.String(64), nullable=False)
    email = db.Column(db.String(255), nullable=False)
    level = db.Column(db.String(64), nullable=True)
    message = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(32), nullable=False, default="pending")
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    reviewed_by_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    reviewed_at = db.Column(db.DateTime, nullable=True)
    reviewed_by = db.relationship("User", foreign_keys=[reviewed_by_id])
    def to_dict(self):
        return {"id": self.id, "name": self.name, "intra_username": self.intra_username,
                "email": self.email, "level": self.level, "message": self.message,
                "status": self.status, "created_at": self.created_at.isoformat() if self.created_at else None,
                "reviewed_at": self.reviewed_at.isoformat() if self.reviewed_at else None}

class ContactMessage(db.Model):
    __tablename__ = "contact_messages"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    email = db.Column(db.String(255), nullable=False)
    message = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    def to_dict(self):
        return {"id": self.id, "name": self.name, "email": self.email,
                "message": self.message, "created_at": self.created_at.isoformat() if self.created_at else None}

class PartnerInquiry(db.Model):
    __tablename__ = "partner_inquiries"
    id = db.Column(db.Integer, primary_key=True)
    organization = db.Column(db.String(255), nullable=False)
    contact_name = db.Column(db.String(255), nullable=False)
    email = db.Column(db.String(255), nullable=False)
    partnership_type = db.Column(db.String(64), nullable=False)
    message = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    def to_dict(self):
        return {"id": self.id, "organization": self.organization, "contact_name": self.contact_name,
                "email": self.email, "partnership_type": self.partnership_type,
                "message": self.message, "created_at": self.created_at.isoformat() if self.created_at else None}

class BlogPost(db.Model):
    __tablename__ = "blog_posts"
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(255), nullable=False)
    slug = db.Column(db.String(255), unique=True, nullable=False, index=True)
    summary = db.Column(db.String(500), nullable=True)
    content = db.Column(db.Text, nullable=False)
    published = db.Column(db.Boolean, nullable=False, default=True)
    author_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=utcnow, onupdate=utcnow)
    author = db.relationship("User", foreign_keys=[author_id])
    def to_dict(self):
        return {"id": self.id, "title": self.title, "slug": self.slug, "summary": self.summary,
                "content": self.content, "published": self.published,
                "author": self.author.name if self.author else None,
                "created_at": self.created_at.isoformat() if self.created_at else None,
                "updated_at": self.updated_at.isoformat() if self.updated_at else None}

class Event(db.Model):
    __tablename__ = "events"
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(255), nullable=False)
    slug = db.Column(db.String(255), nullable=True, index=True)
    description = db.Column(db.Text, nullable=True)
    event_date = db.Column(db.DateTime, nullable=True)
    location = db.Column(db.String(255), nullable=True)
    link = db.Column(db.String(500), nullable=True)
    event_type = db.Column(db.String(64), nullable=False, default="workshop")
    is_public = db.Column(db.Boolean, nullable=False, default=True)
    cover_image = db.Column(db.String(500), nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    def to_dict(self):
        return {"id": self.id, "title": self.title, "slug": self.slug,
                "description": self.description, "event_date": self.event_date.isoformat() if self.event_date else None,
                "location": self.location, "link": self.link, "event_type": self.event_type,
                "is_public": self.is_public, "cover_image": self.cover_image,
                "created_at": self.created_at.isoformat() if self.created_at else None}

class Resource(db.Model):
    __tablename__ = "resources"
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, nullable=True)
    url = db.Column(db.String(500), nullable=True)
    category = db.Column(db.String(64), nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    def to_dict(self):
        return {"id": self.id, "title": self.title, "description": self.description,
                "url": self.url, "category": self.category,
                "created_at": self.created_at.isoformat() if self.created_at else None}

class EventMaterial(db.Model):
    __tablename__ = "event_materials"
    id = db.Column(db.Integer, primary_key=True)
    event_id = db.Column(db.Integer, db.ForeignKey("events.id"), nullable=False)
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, nullable=True)
    file_path = db.Column(db.String(500), nullable=False)
    file_type = db.Column(db.String(64), nullable=False)
    file_size = db.Column(db.Integer, nullable=True)
    sort_order = db.Column(db.Integer, nullable=False, default=0)
    is_revealed = db.Column(db.Boolean, nullable=False, default=False)
    is_downloadable = db.Column(db.Boolean, nullable=False, default=True)
    uploaded_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    event = db.relationship("Event", backref="materials")
    def to_dict(self):
        return {"id": self.id, "event_id": self.event_id, "title": self.title,
                "description": self.description, "file_path": self.file_path,
                "file_type": self.file_type, "file_size": self.file_size,
                "sort_order": self.sort_order, "is_revealed": self.is_revealed,
                "is_downloadable": self.is_downloadable,
                "uploaded_at": self.uploaded_at.isoformat() if self.uploaded_at else None}

class QuizQuestion(db.Model):
    __tablename__ = "quiz_questions"
    id = db.Column(db.Integer, primary_key=True)
    event_id = db.Column(db.Integer, db.ForeignKey("events.id"), nullable=False)
    question = db.Column(db.Text, nullable=False)
    hint = db.Column(db.Text, nullable=True)
    options_json = db.Column(db.Text, nullable=False)
    correct_answer = db.Column(db.Integer, nullable=False)
    explanation = db.Column(db.Text, nullable=True)
    sort_order = db.Column(db.Integer, nullable=False, default=0)

class QuizAttempt(db.Model):
    __tablename__ = "quiz_attempts"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    event_id = db.Column(db.Integer, db.ForeignKey("events.id"), nullable=False)
    score = db.Column(db.Integer, nullable=False)
    answers_json = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    user = db.relationship("User", backref="quiz_attempts")
    event = db.relationship("Event", backref="quiz_attempts")

class AuditLog(db.Model):
    __tablename__ = "audit_logs"
    id = db.Column(db.Integer, primary_key=True)
    admin_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    action = db.Column(db.String(50), nullable=False)
    target_type = db.Column(db.String(50), nullable=False)
    target_id = db.Column(db.Integer, nullable=False)
    details = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
