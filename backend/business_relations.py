"""Shared historical payment context for recommendations and the interview."""
import json
from . import businesses


def build(profile):
    with businesses.connection() as conn:
        # Include both suppliers and customers; combine duplicate directions before grouping.
        partners = conn.execute('''WITH flows AS (
            SELECT beneficiary id,amount_kopecks amount FROM payments WHERE payer=?
            UNION ALL SELECT payer id,amount_kopecks amount FROM payments WHERE beneficiary=?
        ), totals AS (SELECT id,sum(amount) amount FROM flows GROUP BY id)
        SELECT t.id,t.amount,b.industry_code,b.industry,c.topics FROM totals t
        LEFT JOIN businesses b ON b.id=t.id LEFT JOIN business_categories c ON c.business_id=t.id
        ORDER BY t.amount DESC,t.id''', (profile['id'], profile['id'])).fetchall()
    topics = set(profile['news_topics'])
    sectors = {}
    known = 0
    known_amount = 0
    total_amount = sum(p['amount'] for p in partners)
    examples = []
    for partner in partners:
        if partner['topics'] is None:
            continue
        known += 1
        known_amount += partner['amount']
        partner_topics = json.loads(partner['topics'])
        topics.update(partner_topics)
        division = partner['industry_code'].split('.')[0]
        sector = sectors.setdefault(division, {'okved_division': division, 'topics': partner_topics,
                                              'companies': 0, 'turnover_rub': 0, 'industry_examples': []})
        if partner['industry'] not in sector['industry_examples'] and len(sector['industry_examples']) < 3:
            sector['industry_examples'].append(partner['industry'])
        sector['companies'] += 1
        sector['turnover_rub'] += partner['amount'] / 100
        if len(examples) < 12:
            examples.append({'id': partner['id'], 'industry': partner['industry'],
                             'industry_code': partner['industry_code'], 'topics': partner_topics,
                             'turnover_rub': partner['amount'] / 100})
    relations = {'known_companies': known, 'unknown_companies': len(partners)-known,
                 'known_turnover_share': known_amount / total_amount if total_amount else None,
                 'sectors': sorted(sectors.values(), key=lambda s: s['okved_division']),
                 'largest_known_partners': examples,
                 'note': 'Historical payment links, not evidence of current contracts, overdue debt or ownership.'}
    return relations, topics
