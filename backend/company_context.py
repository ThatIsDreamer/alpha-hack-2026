"""Versioned company context. Dataset facts and user statements stay separate."""
import json

from pydantic import BaseModel, ConfigDict, Field, StrictInt, StrictStr, field_validator

SCHEMA_VERSION = 'company-context-v1'
FIELDS = ('description', 'counterparties', 'geography', 'priorities')


class ContextInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    version: StrictInt = Field(ge=0)
    description: StrictStr = Field(max_length=1500)
    counterparties: StrictStr = Field(max_length=1000)
    geography: StrictStr = Field(max_length=1000)
    priorities: StrictStr = Field(max_length=1000)

    @field_validator(*FIELDS)
    @classmethod
    def trim(cls, value):
        return value.strip()


def migrate(conn):
    conn.execute('''CREATE TABLE IF NOT EXISTS context_dataset (
        version TEXT PRIMARY KEY, observed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)''')
    conn.execute('INSERT OR IGNORE INTO context_dataset(version) SELECT version FROM dataset_meta')
    conn.execute("""CREATE TABLE IF NOT EXISTS business_context (
        business_id TEXT PRIMARY KEY, answers TEXT NOT NULL DEFAULT '{}',
        version INTEGER NOT NULL DEFAULT 0, confirmed_at TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)""")
    conn.execute('''INSERT OR IGNORE INTO business_context(business_id)
        SELECT id FROM businesses''')


def read(conn, profile):
    row = conn.execute('SELECT * FROM business_context WHERE business_id=?', (profile['id'],)).fetchone()
    answers = json.loads(row['answers'])
    dataset_version = conn.execute('SELECT version FROM dataset_meta').fetchone()[0]
    observed_at = conn.execute('SELECT observed_at FROM context_dataset WHERE version=?', (dataset_version,)).fetchone()[0]
    facts = {key: profile[key] for key in (
        'industry', 'industry_code', 'region', 'city', 'revenue_rub',
        'employees_range', 'products', 'foreign_trade', 'countries')}
    return {
        'business_id': profile['id'], 'schema_version': SCHEMA_VERSION,
        'version': row['version'], 'status': 'confirmed' if row['confirmed_at'] else 'draft',
        'confirmed_at': row['confirmed_at'], 'updated_at': row['updated_at'],
        'facts': facts, 'facts_provenance': {
            'source': 'synthetic_dataset', 'version': dataset_version, 'observed_at': observed_at,
            'note': 'Данные синтетического профиля; город регистрации не равен географии работы.'},
        'answers': {key: answers.get(key, '') for key in FIELDS},
        'answer_provenance': {
            key: {'source': 'user', 'updated_at': row['confirmed_at']}
            for key in FIELDS if answers.get(key)},
    }
