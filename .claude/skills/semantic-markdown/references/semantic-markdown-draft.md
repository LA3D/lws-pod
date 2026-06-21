---
breaks: false
---
# Semantic Markdown Spec (Alpha Draft)

[TOC]

## Introduction

### What is Semantic Markdown?

Semantic Markdown is a plain-text format
for writing documents that embed machine-readable data.
The documents are easy to author and both human and machine-readable,
so that the structured data contained within these documents
is available to tools and applications.

Technically speaking,
Semantic Markdown is _"RDFa Lite for Markdown"_
and aims at enhancing the HTML generated from Markdown
with [RDFa Lite] attributes.

Design Rationale:
  - Embed RDFa-like semantic annotation within Markdown
  - Ability to mix unstructured human-text with machine-readable data in JSON-LD-like lists
  - Ability to semantically annotate an existing plain Markdown document with semantic annotations
  - Keep human-readability to a maximum

### About this document

:::warning
This document is in early draft stage!
:::

### Providing feedback

Interested in joining the idea or providing feedback?

1. Annotate this document with ideas
2. Join us on the [Semantic Markdown Matrix discussion channel](https://matrix.to/#/#semantic-markdown:matrix.jones.dk)
3. Modify the document directly after your proposals were discussed

## Semantic Markdown at a glance

Semantic annotations are declared within curly braces `{...}`.

### Annotation types

Semantic Markdown provides 3 types of annotations:
- annotating text with a type/class:
  Annotation starting with a `.` indicates a type/class,
  and generate RDFa `typeof` attribute: `{.foaf:Person}`
- annotating text with a property:
  Annotation without leading marker indicates a property,
  and generate RDFa `property` attribute: `{foaf:name}`
- annotating text with a subject identifier:
  Annotation starting with a `=` indicates an IRI of a known entity,
  and generate RDF `resource` attribute: `{=wdt:Q42}`

### Paragraph example

```markdown
My name is
[Manu Sporny]{:name}
and you can give me a ring via
[1-800-555-0199]{:telephone}.
![](http://manu.sporny.org/images/manu.png){:image}
My favorite animal is the [Liger]{ov:preferredAnimal}.
{=<#manu> .:Person}

{schema}: @default

{ov}: http://open.vocab.org/terms/
```

Would produce the following HTML+RDFa:

```html
<p vocab="http://schema.org/" prefix="ov: http://open.vocab.org/terms/" resource="#manu" typeof="Person">
My name is
<span property="name">Manu Sporny</span>
and you can give me a ring via
<span property="telephone">1-800-555-0199</span>.
<img property="image" src="http://manu.sporny.org/images/manu.png" />
My favorite animal is the <span property="ov:preferredAnimal">Liger</span>.
</p>
```

Notice how IRI namespace "schema" is implicitly resolved
from its listing at [RDFa Core Initial Context]

### Title and list example

```markdown
## {.schema:Event schema:name}

## Specification meeting

* Date: [11/10]{schema:startDate}
* Place: [Our office, Street name, Paris]{schema:location}
* Meeting participants: {schema:attendee}
  * Alice
  * Bob
  * [Tim](https://www.wikidata.org/entity/Q80)
* Description: Some information not annotated

## Launch party

(TODO)

{schema}: @default
```
Would produce the following HTML+RDFa:

```html
<div vocab="http://schema.org/">
<h2 typeof="Event" property="name">Specification meeting</h2>
<ul>
<li>Date: <span property="startDate">11/10</span></li>
<li>Place: <span property="location">Our office, Street name, Paris</span></li>
<li>Meeting participants:
<ul>
<li property="attendee">Alice</li>
<li property="attendee">Bob</li>
<li><a property="attendee" href="https://www.wikidata.org/entity/Q80">Tim</a></li>
</ul></li>
<li>Description: Some information not annotated</li>
</ul>
<h2 typeof="Event" property="name">Launch party</h2>
<p>(TODO)</p>
</div>
```

## Annotation syntax

Semantic Markdown is declared as sets of hints.
Each set of hints is declared either directly where applied
or indirectly tied to links.
Hints may use shortened [CURIE][RDFa CURIE] notation,
where uncommon vocabularies need to be defined.

### Hint syntax

Semantic Markdown id written
as a set of zero or more whitespace delimited hints,
wrapped with curly braces `{...}`.
Each hint consists of a type identifier and an address.
Type identifier is either `.` or `=` or none.
Address is either a IRI wrapped with angle brackets `<...>`,
or an [RDFa CURIE].
All CURIEs must use
either an [explicitly defined prefix](Prefix-definition-syntax)
or a prefix listed in [RDFa Core Initial Context].

### Link definition syntax

:::warning
:heavy_exclamation_mark: FIXME: write this...
:::

### Prefix definition syntax

:::warning
:heavy_exclamation_mark: FIXME: write this...
:::

## Annotation scopes

Semantic Markdown is applied to content in different ways:

### Span scope

Hints immediately following an explicitly confined span of text
apply to the span;
i.e. bare spans (square brackets: `[...]`),
underline (underscore: `_..._`),
emphasis (asterisk: `*...*`),
strong emphasis (double asterisk: `**...**`),
inline code (backticks: \`...\`),
or link (square brackets + parenthesis: `[...](...)`).

```markdown
My name is [Manu Sporny]{schema:name}.  
My name is **Manu [Sporny]**{schema:name}.  
My name is [Manu Sporny] {schema:name}.  
My name is Manu Sporny{schema:name}.
```

Would produce the following HTML+RDFa:

```html
<p>My name is <span property="schema:name">Manu Sporny</span><br />
My name is <strong property="schema:name">Manu [Sporny]</strong><br />
My name is [Manu Sporny] {schema:name}<br />
My name is Manu Sporny{schema:name}</p>
```

Notice how third sentence above has no hints
*immediately* following the span,
and fourth sentence has no *explicit* span.

### Block scope

Hints not immediately following an explicit span,
in a block with non-whitespace characters
before the hints and none after,
applies to the block.

```markdown
You can give me a ring. {=<#manu>}

You can give me a ring {=<#manu>}.
```

Would produce the following HTML+RDFa:

```html
<p resource="#manu">You can give me a ring.</p>
<p>You can give me a ring {=&lt;#manu&gt;}.</p>
```

Notice how second paragraph has punctuation *after* the hints.

#### List

Similarly for a list:

```markdown
- Thomas Francart {foaf:name}
- 39 {foaf:age}
- Semantic Web Consultant {rdfs:comment}
```

Would produce the following HTML+RDFa:

```html
<ul>
<li><span property="foaf:name">Thomas Francart</span></li>
<li><span property="foaf:age">39</span></li>
<li><span property="rdfs:comment">Semantic Web Consultant</span></li>
</ul>
```

### Block-tree scope

Hints in a block with non-whitespace characters
after the hints and none before,
applies to the block and any descendant blocks.
If the resulting scope does not correspond
to already generated html scope,
then a div is added.
In particular, when the resulting scope is the whole Markdown context
then a Markdown parser targeting a full html document
(not only a subset of body part as Markdown generally does)
may apply the hints to the `<html>` tag.

```markdown
# People

## {=<#manu>} Manu Sporny

My name is Manu Sporny,
and you can give me a ring.

## Thomas Francart

My name is Thomas Francart.
```

Would produce the following HTML+RDFa:

```html
<h1>People</h1>
<div resource="#manu">
<h2>Manu Sporny</h2>
<p>My name is Manu Sporny,
and you can give me a ring.</p>
</div>
<h2>Thomas Francart</h2>
<p>My name is Thomas Francart.</p>
```

Notice how second header and succeeding paragraph is wrapped
with a div tag,
whereas third header is omitted
because it is not a *descendant* but a *sibling*. 


### Block-siblings scope

Hints in a header or list block
with no non-whitespace characters before or after the hints,
followed by a block of same type and level,
applies individually to each following block of same type and level,
until any block of a lower level.

```markdown
# People

## {.schema:Person}

## Manu Sporny

My name is Manu Sporny.

## Thomas Francart

My name is Thomas Francart.

# Animals
```

Would produce the following HTML+RDFa:

```html
<h1>People</h1>
<div typeof="schema:Person">
<h2>Manu Sporny</h2>
<p>My name is Manu Sporny.</p>
</div>
<div typeof="schema:Person">
<h2>Thomas Francart</h2>
<p>My name is Thomas Francart.</p>
</div>
<h1>Animals</h1>
```

#### List

Similarly for a list:

```markdown
- {foaf:member}
- Thomas
- Vincent
- Nicolas
```

Is equivalent to

```markdown
- Thomas {foaf:member}
- Vincent {foaf:member}
- Nicolas {foaf:member}
```

And would produce the following HTML+RDFa:

```html
<ul>
<li><span property="foaf:member">Thomas</span></li>
<li><span property="foaf:member">Vincent</span></li>
<li><span property="foaf:member">Nicolas</span></li>
</ul>
```

### Block-cluster scope

Hints in a block
with no non-whitespace characters before or after the hints,
followed by a different type or level of block,
applies to the following block
and any contained or descendant blocks;
or followed by a non-header non-list block,
applies to the following block and any following siblings
and any contained or descendant blocks of any of them.
For the context of this definition,
a paragraph or any container block
(block which can contain other blocks)
is considered to be descendent of a leaf block
(block which cannot contain other blocks,
e.g. a header or horisontal ruler).
If the resulting scope does not correspond
to already generated html scope,
then a div is added.
In particular, when the resulting scope is the whole Markdown context
then a Markdown parser targeting a full html document
(not only a subset of body part as Markdown generally does)
may apply the hints to the `<html>` tag.

```markdown
{.schema:Group}

# People

## Manu Sporny

My name is Manu Sporny.

## Thomas Francart

My name is Thomas Francart.

I once read this:

> {=<#manu>}
>
> My name is Manu Sporny.
>
> You can give me a ring.

Should I call him?
```

Would produce the following HTML+RDFa:

```html
<div typeof="schema:Group">
<h1>People</h1>
<h2>Manu Sporny</h2>
<p>My name is Manu Sporny.</p>
<h2>Thomas Francart</h2>
<p>My name is Thomas Francart.</p>
I once read this:
<blockquote resource="#manu">
<p>My name is Manu Sporny.</p>
<p>You can give me a ring.</p>
</blockquote>
<p>Should I call him?</p>
</div>
```

### Link definition scope

Hints not immediately following an explicit span,
in a link definition block
with no non-whitespace characters after the hints,
applies to all references to that definition,
even if no link is defined.
Similar to Markdown link definitions,
source markup of this kind does not in itself result
in any output html markup:
It only affects _other_ markup, and if unused it simply is ignored.

```markdown
My name is
[Manu Sporny]
and you can give me a ring via
[1-800-555-0199].

[Manu Sporny]: {schema:name}

[1-800-555-0199]: tel:+1-800-555-0199
  "make a phone call to Manu Sporny"
  {schema:telephone}
```

Would produce the following HTML+RDFa:

```html
<p>My name is
<span property="schema:name">Manu Sporny</span>
and you can give me a ring via
<a property="schema:telephone" href="tel:+1-800-555-0199" title="make a phone call to Manu Sporny">1-800-555-0199</a>.</p>
```

## Semantic Markdown and other Markdown extensions

### Attributes extension

See [PHP Markdown extra special attributes](https://michelf.ca/projects/php-markdown/extra/#spe-attr)
and [Pandoc's header attributes](https://pandoc.org/MANUAL.html#heading-identifiers):

Semantic Markdown uses similar syntax,
but either with different leading character "="
or "keywords" containing a colon.

Extract from PHP Markdown extra documentation:

> With Markdown Extra,
> you can set the id and class attribute on certain elements
> using an attribute block.
> For instance, put the desired id prefixed by a hash
> inside curly brackets after the header at the end of the line,
> like this:
>
> ```markdown
> Header 1            {#header1}
> ========
> 
>## Header 2 ##      {#header2}
>```
>
> Then you can create links to different parts of the same document
> like this:
>
> ```markdown
> [Link back to header 1](#header1)
> ```
>
> To add a class name, which can be used as a hook for a style sheet,
> use a dot like this:
>
> ```markdown
> ## The Site ##    {.main}
> ```
>
> You can also add custom attributes having simple values
> by specifying the attribute name,
> followed by an equal sign, followed by the value
> (which cannot contain spaces at this time):
>
> ```markdown
> ## Le Site ##    {lang=fr}
> ```
>
> The id, multiple class names, and other custom attributes
> can be combined
> by putting them all into the same special attribute block:
>
> ```markdown
> ## Le Site ##    {.main .shine #the-site lang=fr}
> ```
>
> At this time, special attribute blocks can be used with
>
>  - headers,
>  - fenced code blocks
>  - links, and
>  - images.

### spans

See Pandoc [bracketed spans](https://pandoc.org/MANUAL.html#divs-and-spans)

#### span example

```markdown
Meeting with [Bob]{.foaf:Person}
```

Would produce the following HTML+RDFa:

```html
<p>Meeting with <span typeof="foaf:Person">Bob</span></p>
```

### blocks

#### block example

Annotations declared as a an initial separate block
applies to all siblings by introducing a surrounding `<div>` tag.

```markdown
{.schema:Event}

We are preparing the [2020 Music Festival]{schema:name}!
```

Would produce the following HTML+RDFa:

```html
<div typeof="schema:Event">
<p>We are preparing the <span property="schema:name">2020 Music Festival</span>!</p>
</div>
```

As per [Block scope](#Block-scope),
Annotations declared at the end of a block (modulo whitespace)
applies to that one block.

```markdown
We are preparing the [2020 Music Festival]{schema:name}!
{.schema:Event}
```

Would produce the following HTML+RDFa:

```html
<p typeof="schema:Event">We are preparing the <span property="schema:name">2020 Music Festival</span>!</p>
```

### Extend the extensions: use attributes at other places

#### Set attributes on lists

```markdown
- {foaf:member}
- member 1
- member 2
  - something else
- member 3
```

#### Set attributes on list items

```markdown
- item 1 {foaf:member}
- item 2 {foaf:member}
- item 3 {foaf:member}
```

#### Set attributes on inlines

```markdown
Thomas is _39_{foaf:age}.
```

### Define a "property attribute"

An attribute without `.`, without `#` and that is not a key-value pair
should be recognized as a property name, e.g. `{foaf:name}`.

### Define a "subject attribute"

An attribute beginning with the `=` sign indicates a subject IRI,
equivalent to an `resource=xxx` property,
e.g. `{=wdt:Q42}` is equivalent to `<sometag resource="wdt:Q42">`

## Annotate properties (RDFa "property" attribute)

### Inline properties

#### Properties on inline delimiters

```markdown
Thomas is [39]{foaf:age}.
```

Should yield

```html
<p>Thomas is <span property="foaf:age">39</span></p>
```

Same with `_`, `*` or `**`.

### Annotate with 2 properties

It should be possible to annotate with 2 properties

```markdown
- Name: Alice {foaf:name rdfs:label}
- Age: 23 {foaf:age}
```

Should yield

```html
- Name: <span property="foaf:name rdfs:label">Alice</span>
- Age: <span property="foaf:age">23</span>
```

## Annotate the subject of properties

### Use a class attribute (RDFa "typeof" attribute)

```markdown
# Le site {.foaf:Document}
```

Would produce the following HTML+RDFa:

```
<h1 typeof="foaf:Document">Le site</h1>
```

As per [Block scope](#Block-scope),
above hints applies to an existing block
which serves as placeholder for the semantic hints,
and there is therefore no need for adding a wrapper `<div>` tag.

```markdown
{.foaf:Document}
- item 1
- item 2
- item 3
```

Would produce the following HTML+RDFa:

```html
<ul typeof="foaf:Document">
<li>item 1</li>
<li>item 2</li>
<li>item 3</li>
</ul>
```

(Note that the `typeof` RDFa attribute used alone
generates an anonymous node
as the current subject of inner `property` attributes.
In other words, further property annotations
will refer to an entity of the provided type.)

### Use an ID attribute (RDFa "resource" attribute)

Use an annotation starting with "="

```markdown
# Douglas Adams {=wdt:Q42}
```

:::danger
:heavy_exclamation_mark:
FIXME: Undecided if leading character `=` should be replaced
with e.g. `@`or `#`.
:::

### Combine ID + class

It should be possible to combine an ID and a type attribute

```markdown
His name is [Douglas Adams]{.foaf:Person =wdt:Q42}

{wdt}: http://www.wikidata.org/prop/direct/
```

Should produce the following HTML+RDFa

```html
<p prefix="wdt: http://www.wikidata.org/prop/direct/">His name is <span typeof="foaf:Person" resource="wdt:Q42">Douglas Adams</span></p>
```

But beware that if one hint is broken
then the whole annotation is passed through as-is,
e.g. if using an undefined prefix:

```markdown
His name is [Douglas Adams]{.foaf:Person =wdt:Q42}
```

Should produce the following HTML+RDFa

```html
<p>His name is [Douglas Adams]{.foaf:Person =wdt:Q42}</p>
```

## Where to find the current subject?

RDFa relies on a mechanism
to indicate the [_current subject_ of the annotation](https://www.w3.org/TR/rdfa-core/#setting-the-current-subject).
Semantic Markdown aims at having an equivalent mechanism.

Intuitively, the current subject is the resource
annotated in the "closest ancestor" of a property annotation.

### Current span subject

Used to indicate
that a certain inline portion of a sentence is about an entity.

```markdown
[Tim Berners Lee]{=wdt:Q80} invented the web.

{wdt}: http://www.wikidata.org/prop/direct/
```

Should yield

```html
<p prefix="wdt: http://www.wikidata.org/prop/direct/"><span resource="wdt:Q80">Tim Berners Lee</span> invented the web.</p>
```

### Current paragraph subject

Used to indicate
that a whole paragraph is about an entity.
The annotation is at the end of the paragraph for readability.

```markdown
Tim Berners Lee invented the web. {=wdt:Q80}

{wdt}: http://www.wikidata.org/prop/direct/
```

Should yield

```html
<p prefix="wdt: http://www.wikidata.org/prop/direct/" resource="wdt:Q80">Tim Berners Lee invented the web.</p>
```

### Current list subject

Used to indicate that a whole list describes an entity.
The annotation should be sought
at the end of the line preceding the list.

```markdown
{=wdt:Q80}
- Name: [Tim Berner's Lee]{foaf:name}
- ISNI: [0000 0000 7866 6209]{wd:P213}

{wdt}: http://www.wikidata.org/prop/direct/

{wd}: http://www.wikidata.org/entity/
```
Should yield

```html
<ul prefix="wdt: http://www.wikidata.org/prop/direct/ wd: http://www.wikidata.org/entity/" resource="wdt:Q80">
<li>Name: <span property="foaf:name">Tim Berner's Lee</span></li>
<li>ISNI: <span property="wd:P213">0000 0000 7866 6209</span></li>
</ul>
```

### Paragraph preceding a list

If an annotation is between a paragraph and a list,
then it applies to the list
when standalone with double newlines
same as writing a separate paragraph:

```markdown
The web was invented by this geek:

{=wdt:Q80}

- Name: Tim Berner's Lee {foaf:name}
- ISNI: 0000 0000 7866 6209 {wd:P213}

{wdt}: http://www.wikidata.org/prop/direct/

{wd}: http://www.wikidata.org/entity/
```

Should yield

```html
<div prefix="wdt: http://www.wikidata.org/prop/direct/ wd: http://www.wikidata.org/entity/">
<p>The web was invented by this geek:</p>
<ul resource="wdt:Q80">
<li>Name: <span property="foaf:name">Tim Berner's Lee</span></li>
<li>ISNI: <span property="wd:P213">0000 0000 7866 6209</span></li>
</ul>
</div>
```

### Indented lists

Indented lists are key
because they could make plain Markdown lists look like JSON-LD trees;

Plain Markdown list:

```markdown
Here is our meeting description:

- Date: 10/11/2019
- Location: somewhere
- Attendees:
  - Alice
    - Engineer
    - Works for: Foo
    - Hobbies:
      - Football
      - Video games
  - Bob
    - Sales Manager
    - Works for: Bar
    - Hobbies: 
      - Cooking
      - Cycling
```

Annotated version:

```markdown
{.schema:Event}

Here is our meeting description:

- Date: 10/11/2019 {schema:startDate}
- Location: somewhere {schema:place}
- Attendees:
- {schema:attendee}
  - Alice {schema:name}
    - Engineer {schema:jobTitle}
    - Works for: [Foo]{schema:affiliation}
    - Hobbies:
      - {schema:knowsAbout}
      - Football
      - Video games
- {schema:attendee}
  - Bob {schema:name}
    - Sales Manager {schema:jobTitle}
    - Works for: [Bar]{schema:affiliation}
    - Hobbies:
      - {schema:knowsAbout}
      - Cooking
      - Cycling
```

:::danger
:heavy_exclamation_mark:
FIXME: Either replace this section with JSON-LD like style
or drop this section
:::

### Current blockquote subject

Used to indicate that a blockquote describes an entity

:::danger
:heavy_exclamation_mark:
FIXME: Either document how or drop this section
:::

### Current header subject

Used to indicate
that a certain section of a document describes an entity.

The following annotated MD:

```markdown
## {=ex:AliceIRI} Description of Alice

She is [23]{foaf:age} and lives in [Berlin]{foaf:basedNear}.

{ex}: http://example.org/
```

Should produce the following HTML+RDFa:

```html
<div prefix="ex: http://example.org/">
<div resource="ex:AliceIRI">
<h2>Description of Alice</h2>

<p>She is <span property="foaf:age">23</span> and lives in <span property="foaf:basedNear">Berlin</span></p>
</div>
```

Similarly

```markdown
## {.schema:Event} Specification meeting

- Date: 10/11/2019 {schema:startDate}
- Location: somewhere {schema:location}
```

Should produce the following HTML+RDFa:

```html
<div typeof="schema:Event">
<h2>Specification meeting</h2>
<ul>
<li>Date: <span property="schema:startDate">10/11/2019</span></li>
<li>Location: <span property="schema:location">somewhere</span></li>
</ul>
</div>
```

### Current div subject

```markdown
{=wdt:Q80}

Tim Berners Lee invented the web.

He now works on Solid.

{wdt}: http://www.wikidata.org/prop/direct/
```

Should yield

```html
<div prefix="wdt: http://www.wikidata.org/prop/direct/" about="wdt:Q80">
<p>Tim Berners Lee invented the web.</p>
<p>He now works on Solid.</p>
</div>
```

As per [Block-cluster scope](#Block-cluster-scope),
hints applies until next descendant block or sibling paragraph.
To limit without introducing new content,
use an empty hint:

```markdown
{=wdt:Q80}

Tim Berners Lee invented the web.

He now works on Solid.

{}

A paragraphe after the div ended.

{wdt}: http://www.wikidata.org/prop/direct/
```

Should yield

```html
<div prefix="wdt: http://www.wikidata.org/prop/direct/" about="wdt:Q80">
<p>Tim Berners Lee invented the web.</p>
<p>He now works on Solid.</p>
</div>
<p>A paragraphe after the div ended.</p>
```

## Declaring prefixes

Declare [prefix definitions](#Prefix-definition-syntax),
anywhere in the document,
preferably at the end to ease readability.

```markdown
{.schema:Event}
* Date: [10/11/2019]{schema:startDate}
* Location: [somewhere]{ex:good_place}

{schema}: http://schema.org/

{rdfs}: http://www.w3.org/2000/01/rdf-schema#

{ex}: http://example.org/
```

Should yield

```html
<div prefix="schema: http://schema.org/ rdfs: http://www.w3.org/2000/01/rdf-schema# ex: http://example.org/">
<ul typeof="Event">
<li>Date: <span property="startDate">10/11/2019</span></li>
<li>Location: <span property="ex:good_place">somewhere</span></li>
</ul>
</div>
```

### Prefix and link definitions have similar but separate syntax

Prefixes mimic the syntax for links,
but using curly brackets instead of angle brackets:

```markdown
### Specifications Meeting {.schema:Event}

* Date: 10/11/2019 {.schema:startDate}

Bla bla bla as is documented in the [schema] ontology.

—
[schema]: http://schema.org/

{schema}: http://schema.org/

{rdfs}: http://www.w3.org/2000/01/rdf-schema#
```

### Specifying the default prefix

Declaring a  prefix as the default generates a `vocab` attribute
instead of a prefix on the outermost block of the text,
adding a div if no such block exists already.
All uses of that default prefix is then generated without a prefix.

```markdown
My name is [Alice]{ex:name}.

{ex}: http://example.org/ @default
```

Would produce the following HTML+RDFa:

```html
<p vocab="http://example.org/">My name is <span property="name">Alice</span></p>
```

:::danger
FIXME : The default namespace should make it possible
to annotate the document without using a prefix at all.
Instead of giving the default
both a prefix name _and_ a special annotation,
I suggest using `@default` as the prefix itself.

```markdown
My name is [Alice]{name}.

{@default}: http://example.org/ 
```

Would produce the following HTML+RDFa:

```html
<p vocab="http://example.org/">My name is <span property="name">Alice</span></p>
```
:::

### Common prefixes are implicitly defined

All prefixes predefined in [RDFa Core Initial Context] can be used
without explicitly defining them.

```markdown
My name is [Alice]{schema:name}.
```

Would produce the following HTML+RDFa:

```html
<p>My name is <span property="schema:name">Alice</span></p>
```

## Referring to a IRI

### Absolute IRI reference with <>

`Meeting with [Bob]{.<http://xmlns.com/foaf/0.1/Person>}`

### CURIE (with a declared prefix)

```markdown
Meeting with [Bob]{.f:Person}

{f}: http://xmlns.com/foaf/0.1/
```

----

## Parallel Idea: Indented Lists using Link References (JSON-LD or YAML-like lists).

```markdown
## {.schema:Event}
## Bird watchers meeting

- [Date]: 10/11/2019
- [Location]: somewhere
- [Attendees]:
  - [Name]: Alice
    - [jobTitle]: Engineer
    - [Works for]: Foo
    - [Hobbies]:
      - Football
      - Video games
  - [Name]: Bob
    - [jobTitle]: Sales Manager
    - [Works for]: Bar
    - [Hobbies]:
      - Cooking
      - Cycling

## Train spotters meeting

(TODO)

[Date]: {schema:startDate}
[Location]: {schema:Location}
[Name]: {schema:name}
[jobTitle]: {schema:jobTitle}
[Works for]: {schema:affiliation}
[Hobbies]: {schema:knowsAbout}
```

Link can optionally be made clickable
by adding a link to its definition at the bottom.

# See also

http://rdfa.info/

Whereas the scope of this project is limited
to authoring a specification
and maybe developing proof-of-concept parsers for it,
some projects doing similar or more than that
can be of inspiration.

[Roam-research](https://roamresearch.com/)
[Org-roam](https://org-roam.readthedocs.io/en/master/) 
[TiddlyRoam](https://joekroese.github.io/tiddlyroam/)

There is also some experimentations
on how to use those specifications:
[SemanticMarkdown use cases studies](https://hackmd.io/yrm6X38NQTG6X-g6eyNt_g)

Other references :
[RDFa Lite]
[RDFa CURIE]
[RDFa Core]
[RDFa Core Initial Context]

[RDFa Lite]: https://www.w3.org/TR/rdfa-lite/

[RDFa CURIE]: https://www.w3.org/TR/rdfa-core/#s_curies

[RDFa Core Initial Context]: https://www.w3.org/2011/rdfa-context/rdfa-1.1

[RDFa Core]: https://www.w3.org/TR/rdfa-core/

---

# Deprecated Stuff

#### Attributes on a word without inline delimiters?

```markdown
Thomas is 39{foaf:age}.
```

#### Properties on word without delimiters

If a property annotation immediately follows a word
with no explicit inline delimiters,
it should be applied to this word only.
(Is it really possible in terms of parsing? don't know).

```markdown
Thomas is 39{foaf:age}.
```

Should yield

```html
<p>Thomas is <span property="foaf:age">39</span></p>
```

#### IRI written directly as key

```markdown
- foaf:name: Thomas Francart
- foaf:age = 39
- rdfs:comment: Semantic Web Consultant
```

Should yield

```html
<ul>
  <li>foaf:name: <span property="foaf:name">Thomas Francart</span></li>
  <li>foaf:age = <span property="foaf:age">Thomas Francart</span></li>
  <li>rdfs:comment: <span property="rdfs:comment">Semantic Web Consultant</span></li>
</ul>
```

#### Omit list item leading key and trailing repetition punctuation

If the list item contains `:` or `=`,
the annotation is applied to the string after this character.
If final non-space non-annotation character of the list item
is `,` or `;`,
the annotation is applied to the string before this character.

```markdown
- Name: Thomas Francart {foaf:name}
- Age = 39 {foaf:age}
- Profession: Semantic Web Consultant; {rdfs:comment}
- Hobby: Bird watching; train spotting; {rdfs:comment}
```

Should yield (note how semi-colons are excluded from last annotations):

```html
<ul>
  <li>Name: <span property="foaf:name">Thomas Francart</span></li>
  <li>Age = <span property="foaf:age">39</span></li>
  <li>Profession: <span property="rdfs:comment">Semantic Web Consultant</span>;</li>
  <li>Hobby: <span property="rdfs:comment">Bird watching</span>; <span property="rdfs:comment">train spotting</span>;</li>
</ul>
```
