---
type: Concept
title: Progressive Disclosure
description: Layered retrieval — orientation first, drill into detail on demand.
tags: [retrieval, memory]
broader: "[[Hierarchical Retrieval]]"
implementedBy: "[[Index View]]"
---
# Progressive Disclosure

Progressive disclosure exposes a knowledge base in **layers** — an index first, then
concepts, then full detail — instead of flat search. It is a form of [[Hierarchical Retrieval]],
and it is realized by the [[Index View]] implementation.

The routing-reliability (Fano) bound keeps each index node's branching factor $b \leq 12$, so the
expected number of lookups to reach a leaf scales logarithmically:

$$
\text{depth} = \lceil \log_b N \rceil, \qquad b \leq 12
$$

| Approach | Lookups | Correctness ceiling |
|---|---|---|
| Flat similarity search | $O(N)$ | bounded (no-escape theorem) |
| Typed hierarchical | $O(\log_b N)$ | escapes the bound |

```python
def depth(n, b=12):
    from math import log, ceil
    return ceil(log(n, b))
```
