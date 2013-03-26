<style>
  img[alt='ilm-logo'] {float: right; max-width:20%; margin-left:1em;}
</style> 

![ilm-logo](http://dl.dropbox.com/u/382588/ILM-HTML5/logo.svg)

# Simple REST interface for ‘ILM conversion

__Concept:__ By providing a simple server-side conversion service, we can make it very easy to work on ‘ILM docuemnts. The user can easily add a script tag to display a text document as ‘ILM formatted

### Usage

POST /convert/from/to <document>

 - Options from: text,ilm,html5
 - Options to: text_ansi,text_ascii,text_utf8,ilm,html5,epub

PUT /update/wordlist <csv-wordlist>

GET / about page

### [About ‘ILM Format -->](http://dl.dropbox.com/u/382588/ILM-HTML5/ILM-Service/ILM-Format.html)