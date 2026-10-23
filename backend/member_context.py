"""Demo identities, private member context and reviewed shared-context proposals.

The selected demo identity is NOT authentication. Production must derive it from a
bank session and verified company membership, never a client-controlled header.
"""
import json
from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field, StrictInt, StrictStr

from . import businesses, company_context

router = APIRouter(prefix='/api/businesses', tags=['Member context'])
ROLES = {
    'owner': 'Собственник бизнеса', 'ceo': 'Генеральный директор',
    'cfo': 'Финансовый директор', 'accountant': 'Главный бухгалтер',
    'treasury': 'Руководитель казначейства', 'executive': 'Другой C-level-руководитель',
    'other': 'Другой сотрудник, участвующий в принятии решений',
}
PERSONAL_FIELDS = ('personal_tasks', 'personal_focus')
DEMO_MEMBERS = [dict(id=f'member-{i}', name=f'Сотрудник {i}', can_approve=i == 1) for i in range(1, 4)]


def migrate(conn):
    conn.execute('''CREATE TABLE IF NOT EXISTS company_members (
        business_id TEXT NOT NULL, member_id TEXT NOT NULL, role TEXT,
        personal_answers TEXT NOT NULL DEFAULT '{}', version INTEGER NOT NULL DEFAULT 0,
        confirmed_at TEXT, welcome_seen INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(business_id,member_id))''')
    conn.execute('''CREATE TABLE IF NOT EXISTS context_proposals (
        id TEXT PRIMARY KEY, business_id TEXT NOT NULL, member_id TEXT NOT NULL,
        base_version INTEGER NOT NULL, changes TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
        reviewed_by TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        reviewed_at TEXT, author_role TEXT)''')
    if 'author_role' not in {r[1] for r in conn.execute('PRAGMA table_info(context_proposals)')}:
        conn.execute('ALTER TABLE context_proposals ADD COLUMN author_role TEXT')
    columns = {row[1] for row in conn.execute('PRAGMA table_info(context_dialogues)')}
    if 'member_id' not in columns:
        conn.execute("ALTER TABLE context_dialogues ADD COLUMN member_id TEXT NOT NULL DEFAULT ''")


def identity(member_id):
    member = next((m for m in DEMO_MEMBERS if m['id'] == member_id), None)
    if not member:
        raise HTTPException(403, 'Демо-пользователь не принадлежит компании.')
    return member


def read(conn, business_id, member_id):
    person = identity(member_id)
    if not conn.execute('SELECT 1 FROM businesses WHERE id=?', (business_id,)).fetchone():
        raise HTTPException(404, 'Компания не найдена')
    row = conn.execute('SELECT * FROM company_members WHERE business_id=? AND member_id=?', (business_id, member_id)).fetchone()
    answers = json.loads(row['personal_answers']) if row else {}
    return dict(**person, role=row['role'] if row else None,
                role_label=ROLES.get(row['role']) if row else None,
                version=row['version'] if row else 0,
                confirmed=bool(row and row['confirmed_at']), welcome_seen=bool(row and row['welcome_seen']),
                answers={key: answers.get(key, '') for key in PERSONAL_FIELDS})


def profile(business_id, member_id):
    with businesses.connection() as conn:
        return read(conn, business_id, member_id)


@router.get('/{business_id}/member-context')
def current_member(business_id: str, x_demo_user_id: str = Header(..., max_length=50)):
    with businesses.connection() as conn:
        own = read(conn, business_id, x_demo_user_id)
    return dict(member=own, members=DEMO_MEMBERS, roles=[dict(id=k, label=v) for k, v in ROLES.items()])


class RoleInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    version: StrictInt = Field(ge=0)
    role: Literal['owner', 'ceo', 'cfo', 'accountant', 'treasury', 'executive', 'other']


@router.post('/{business_id}/member-context/role')
def choose_role(business_id: str, payload: RoleInput, x_demo_user_id: str = Header(..., max_length=50)):
    with businesses.connection(write=True) as conn, conn:
        conn.execute('BEGIN IMMEDIATE')
        own = read(conn, business_id, x_demo_user_id)
        if own['version'] != payload.version:
            raise HTTPException(409, 'Ваш профиль изменился. Загрузите актуальные данные.')
        conn.execute('INSERT OR IGNORE INTO company_members(business_id,member_id) VALUES (?,?)', (business_id, x_demo_user_id))
        if own['role'] != payload.role:
            conn.execute('''UPDATE company_members SET role=?,version=version+1,confirmed_at=NULL
                WHERE business_id=? AND member_id=?''', (payload.role, business_id, x_demo_user_id))
        return read(conn, business_id, x_demo_user_id)


@router.post('/{business_id}/member-context/welcome')
def welcome(business_id: str, x_demo_user_id: str = Header(..., max_length=50)):
    with businesses.connection(write=True) as conn, conn:
        own = read(conn, business_id, x_demo_user_id)
        if not own['role']:
            raise HTTPException(409, 'Сначала выберите свою роль.')
        conn.execute('UPDATE company_members SET welcome_seen=1 WHERE business_id=? AND member_id=?', (business_id, x_demo_user_id))
        return read(conn, business_id, x_demo_user_id)


class ConfirmInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    dialogue_id: StrictStr = Field(max_length=36)
    revision: StrictInt = Field(ge=0)


@router.post('/{business_id}/member-context/confirm')
def confirm(business_id: str, payload: ConfirmInput, x_demo_user_id: str = Header(..., max_length=50)):
    with businesses.connection(write=True) as conn, conn:
        conn.execute('BEGIN IMMEDIATE')
        own = read(conn, business_id, x_demo_user_id)
        row = conn.execute('''SELECT * FROM context_dialogues WHERE id=? AND business_id=?
            AND member_id=? AND confirmed_version IS NULL AND revision=?''',
            (payload.dialogue_id, business_id, x_demo_user_id, payload.revision)).fetchone()
        if not row:
            raise HTTPException(409, 'Разговор изменился. Откройте сохранённый диалог.')
        state = json.loads(row['state'])
        if not state['ready'] or state.get('member_version') != own['version']:
            raise HTTPException(409, 'Завершите актуальный разговор и проверьте результат.')
        personal = {key: state['draft'].get(key, '') for key in PERSONAL_FIELDS}
        now = datetime.now(timezone.utc).isoformat()
        conn.execute('''UPDATE company_members SET personal_answers=?,version=version+1,confirmed_at=?
            WHERE business_id=? AND member_id=?''', (json.dumps(personal, ensure_ascii=False), now, business_id, x_demo_user_id))
        # Compare against the snapshot the member actually saw, never overwrite newer facts.
        original = state['company_answers']
        changes = {key: state['draft'][key] for key in company_context.FIELDS if state['draft'][key] != original[key]}
        proposal_id = str(uuid4()) if changes else None
        if changes:
            conn.execute('''INSERT INTO context_proposals(id,business_id,member_id,base_version,changes,author_role)
                VALUES (?,?,?,?,?,?)''', (proposal_id, business_id, x_demo_user_id, row['base_version'], json.dumps(changes, ensure_ascii=False), own['role_label']))
        conn.execute('UPDATE context_dialogues SET confirmed_version=? WHERE id=?', (row['base_version'], row['id']))
        return dict(member=read(conn, business_id, x_demo_user_id), proposal_id=proposal_id)


@router.get('/{business_id}/context/proposals')
def proposals(business_id: str, x_demo_user_id: str = Header(..., max_length=50)):
    with businesses.connection() as conn:
        own = read(conn, business_id, x_demo_user_id)
        rows = conn.execute('SELECT * FROM context_proposals WHERE business_id=? ORDER BY created_at DESC,rowid DESC', (business_id,))
        items = [dict(id=r['id'], member_id=r['member_id'], base_version=r['base_version'],
                      changes=json.loads(r['changes']), author_role=r['author_role'], status=r['status'], reviewed_by=r['reviewed_by'])
                 for r in rows if own['can_approve'] or r['member_id'] == x_demo_user_id]
        company = conn.execute('SELECT answers,version FROM business_context WHERE business_id=?', (business_id,)).fetchone()
        return dict(items=items, company_version=company['version'], company_answers=json.loads(company['answers']))


class ReviewInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    action: Literal['approve', 'reject']
    version: StrictInt = Field(ge=0)


@router.post('/{business_id}/context/proposals/{proposal_id}/review')
def review(business_id: str, proposal_id: str, payload: ReviewInput, x_demo_user_id: str = Header(..., max_length=50)):
    with businesses.connection(write=True) as conn, conn:
        conn.execute('BEGIN IMMEDIATE')
        own = read(conn, business_id, x_demo_user_id)
        if not own['can_approve']:
            raise HTTPException(403, 'Подтверждать изменения может только ответственный за контекст.')
        proposal = conn.execute('SELECT * FROM context_proposals WHERE id=? AND business_id=?', (proposal_id, business_id)).fetchone()
        if not proposal or proposal['status'] != 'pending':
            raise HTTPException(409, 'Предложение уже рассмотрено или не найдено.')
        now = datetime.now(timezone.utc).isoformat()
        if payload.action == 'approve':
            company = conn.execute('SELECT * FROM business_context WHERE business_id=?', (business_id,)).fetchone()
            if company['version'] != payload.version or proposal['base_version'] != company['version']:
                raise HTTPException(409, 'Общий контекст уже изменился. Нужно заново уточнить сведения; устаревшее предложение можно отклонить.')
            answers = {key: json.loads(company['answers']).get(key, '') for key in company_context.FIELDS}
            answers.update(json.loads(proposal['changes']))
            conn.execute('''UPDATE business_context SET answers=?,version=version+1,confirmed_at=?,updated_at=?
                WHERE business_id=? AND version=?''', (json.dumps(answers, ensure_ascii=False), now, now, business_id, payload.version))
        conn.execute('UPDATE context_proposals SET status=?,reviewed_by=?,reviewed_at=? WHERE id=?',
                     ('approved' if payload.action == 'approve' else 'rejected', x_demo_user_id, now, proposal_id))
        return dict(status='approved' if payload.action == 'approve' else 'rejected')
