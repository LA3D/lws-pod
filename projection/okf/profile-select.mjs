import matter from 'gray-matter'
import { baseProfile } from './base-profile.mjs'

export function selectProfile(rootIndexText, registry) {
  const name = matter(rootIndexText).data?.okf_profile
  return (name && registry[name]) || baseProfile
}
