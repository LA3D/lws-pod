import { describe, it, expect } from 'vitest'
import { slugFromUrl, makeIdentityPolicy, subjectIri } from './identity.mjs'

const policy = makeIdentityPolicy({ base: 'https://pod.example/kb/' })

describe('identity', () => {
  it('slugFromUrl strips dir, .md, and fragment', () => {
    expect(slugFromUrl('http://pod/c/progressive-disclosure.md')).toBe('progressive-disclosure')
    expect(slugFromUrl('http://pod/c/x.md#it')).toBe('x')
  })

  it('mints a namespace+slug IRI independent of the storage URL', () => {
    expect(subjectIri({}, 'http://pod-A/c/x.md', policy)).toBe('https://pod.example/kb/x#it')
    expect(subjectIri({}, 'http://pod-B/other/x.md', policy)).toBe('https://pod.example/kb/x#it')
  })

  it('honors a declared frontmatter id verbatim', () => {
    expect(subjectIri({ id: 'https://w3id.org/thing/42' }, 'http://pod/c/x.md', policy))
      .toBe('https://w3id.org/thing/42')
  })
})
