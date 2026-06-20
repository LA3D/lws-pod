---
type: Concept
title: Hierarchical Retrieval
description: Routing through a typed hierarchy instead of flat similarity search.
tags: [retrieval]
implementedBy: "[[Type Index]]"
---
# Hierarchical Retrieval

Hierarchical retrieval routes a query through **typed structure** rather than one flat embedding
distance. Given branching factor $b$ and depth $d$, the addressable space is $b^{d}$ — so a shallow
tree covers a large corpus while keeping each routing decision within the Fano bound.

- [x] typed edges as interface operations
- [x] bounded branching per node
- [ ] cross-scheme `skos:exactMatch` bridges
