// The relational floor: every skos:Concept MUST declare a wm:implementedBy IRI edge.
// No target-existence check - dangling (not-yet-written) implementations are allowed.
// The laden message is the teaching channel agents respond to.
export const wmConceptWiringShape = `@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
@prefix wm: <https://w3id.org/cogitarelink/wm#> .

wm:ConceptWiringShape a sh:NodeShape ;
  sh:targetClass skos:Concept ;
  sh:property [
    sh:path wm:implementedBy ;
    sh:minCount 1 ;
    sh:nodeKind sh:IRI ;
    sh:message "Declare how this concept is implemented: add a wm:implementedBy link to an implementation card. The target need not exist yet - not-yet-written implementations are fine."
  ] .
`
