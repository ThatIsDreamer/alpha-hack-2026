import httpx

from dataclasses import dataclass, field
from typing import Protocol, Iterable


@dataclass
class Item:
    external_id: str
    url: str
    title: str = ''
    text: str = ''
    published_at: str | None = None
    metadata: dict = field(default_factory=dict)


class Collector(Protocol):
    def discover(self) -> Iterable[Item]: ...
    def hydrate(self, item: Item) -> Item: ...


def fetch(client, url, *, verify_tls=True, **kwargs):
    # Public sources require no session; discard tracking cookies between requests.
    # Some publishers send non-ASCII cookies which cannot be sent as HTTP headers.
    if not verify_tls:
        # Explicit per-source opt-out for public sites using an untrusted CA.
        # Never mutate the shared client: other sources retain certificate checks.
        with httpx.Client(verify=False, timeout=client.timeout, headers=client.headers,
                          follow_redirects=True) as source_client:
            response = source_client.get(url, **kwargs)
            response.raise_for_status()
            return response
    client.cookies.clear()
    response = client.get(url, **kwargs)
    response.raise_for_status()
    return response
