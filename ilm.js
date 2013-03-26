
// get params
// check for existence of src folder
// check for out folder, create if necessary
// get all text file in folder as list
// loop through each, convert to markdown, save to out folder

// param definition, at minimum, we need source and dest directories
var argv = require('optimist')
  .usage('Convert folder of Ocean-style text docs to Markdown with metadata.\nUsage: $0')
  .alias('s', 'src').describe('s', 'Source Directory')
  .default('s', '../Library').default('src', '../Library')
  .alias('d', 'dest').describe('d', 'Destination Directory')
  .default('d', '../Library.html5').default('dest', '../Library.html5')
  .argv
;

// testing scripts
console.log('\n========================================= \n');

var path = require('path');
var fs = require('fs');
var colors = require('colors');
var wrench = require('wrench');
var marked = require('marked');
require('date-utils');
//var request = require('request');
//var xmldoc = require('xmldoc');
var _ = require('underscore');
_.str = require('underscore.string');
_.mixin(_.str.exports());
var transliteration_list = read_transliteration_list(); // synchronous
var replacment_list = transliterate_replacement_list(transliteration_list);
var slug_replacement_list = slug_replacement_list(transliteration_list);
rebuildReplacementsJS();

// get the full version of the two starting directories
var src = path.resolve(argv.src).replace(/\\/gi, '/');
var dest = path.resolve(argv.dest).replace(/\\/gi, '/');

// Require source directory or file
if (!fs.existsSync(src)) {
  console.log('Could not find source file or folder: '.bold.red + src.red);
  process.exit(1);
}
var transliterate = read_transliteration_list();

// read all files from dir
var convertfiles = [];
fs.stat(src, function(err, stats) {
  if (stats.isDirectory()) {
    wrench.readdirRecursive(src, function(error, allfiles) { if (allfiles !== null) allfiles.map(ocn2mdProcessFile); });
  } else ocn2mdProcessFile(src);
});


// ===================================================
// ===================================================

function ocn2mdProcessFile(file) {
  function call_profiled(func, data, meta) {
    var startfunc = new Date();
    data = eval(func)(data, meta);
    console.log(String(func).green +' '+ String(new Date() - startfunc).red + 'ms'.red);
    return data;
  }

  if (path.extname(file) !== '.txt') return;
  file = file.replace(/\\/gi, '/'); // make sure all paths are using forward slashes
  console.log("Processing: " + file.green);
  // parse file for path data
  //  language /  bookshelf /  Author /.../ title.txt
  // load file into mem
  var oldpath = src + '/' + file;
  fs.readFile(oldpath, function read(err, data) {
    if (err) {throw err;}
    var ext = path.extname(file),
        obj = extract_metadata(data, file),
        meta = obj.meta;
    data = String(obj.data);
    var start_main = new Date();

    data = call_profiled('filter_text_cleanup', data, meta);
    data = call_profiled('filter_bahai_words', data, meta);
    data = call_profiled('filter_footnotes', data, meta);
    data = call_profiled('filter_subheads', data, meta);
    data = call_profiled('filter_dates', data, meta);
    data = call_profiled('filter_pagemarkers', data, meta);
    // after markdown processing, we are guaranteed to have well-ordered HTML
    data = call_profiled('filter_markdown', data, meta);
    data = call_profiled('filter_quotes', data, meta);
    data = call_profiled('filter_numbering', data, meta);
    data = call_profiled('filter_numbering', data, meta);
    data = call_profiled('filter_typography', data, meta);
    data = call_profiled('apply_html5_template', data, meta);

    console.log('Total Processing time: '.toUpperCase().green +String(new Date() - start_main).red + 'ms'.red);
    // save to new location
    var newdir = dest + '/' + meta.language +'/'+ meta.bookshelf +'/'+ meta.author +'/';
    var newpath = newdir + path.basename(file, ext) + '.html';
    wrench.mkdirSyncRecursive(newdir, 0777);
    fs.writeFile(newpath, data, function(err) {
      if(err) console.log(err);
      console.log("Saved as: " + newpath);
    });
  });
}
function extract_metadata(data, file) {
  data = String(data);

  var ext = path.extname(file),
      title = path.basename(file, ext);
  meta = {
    title: title,
    language : file.split('/')[0],
    languagecode : file.split('/')[0].substr(0,2).toLowerCase(),
    bookshelf : file.split('/')[1],
    author : file.split('/')[3],
    subtitle: '',
    description: '',
    acronym: title.match(/\b([A-Z])/g).join('').toUpperCase(),
    bookimage: "https://dl.dropbox.com/u/382588/ILM-HTML5/ilmLogo.jpg",
    isbn: '',
    publisher: "Baha'i Publishing Trust, Wilmette Illinois 60091",
    publishinfo: "Revised Edition 1980",
    publishdate: '',
    copyright: "Copyright by the National Spiritual Assembly of the Baha'is of the United States",
    numbering: "sequential" // or 'sections' or 'none'
  };
  //meta = {};

  //console.log(meta);

  // now check for meta-data in file itself
  var lines = String(data).replace(/\r/g,'').split("\n");
  var foundblock = false;
  for (var i=0; i<50; i++) if (i<lines.length) {

   //console.log (line_type(lines[i]).red +': '+ lines[i].green);

   if (line_type(lines[i]) === 'meta-start') foundblock = true;
   if (foundblock) {
     if (line_type(lines[i]) === 'meta-end') break;
     if ((lines[i].indexOf('=')<0) || _.startsWith(lines[i], '//')) continue;
     var key = lines[i].trim().split('=')[0].trim().toLowerCase();
     var value = String(lines[i]).substring(lines[i].indexOf('=')+1, lines[i].length).trim();
     if (key.length>2 && value.length) meta[key] = value;
   }
  }
  if (foundblock) data = data.slice(data.indexOf('meta-end -->')+12);

  //console.log(meta);

  /*
  {{ Title=Citadel of Faith }}

  ## {{Preface}}

  ##  {{author=shoghi}}  Selections from the Guardian

  {{author=shoghi}}
  */



  if (!foundblock) for (i=0; i<lines.length; i++) {
    // try to extract some of these items from file header

  }

  return {'meta': meta, 'data': data};
}
function get_isbndb_meta(meta) {
  /*
  // http://isbndb.com/api/books.xml?access_key=%20I3PPUE3D&index1=title&value1=citadel+of+faith
  var req = "http://isbndb.com/api/books.xml?access_key=%20I3PPUE3D&index1=title&value1=" +
     encodeURIComponent(meta.title);
  request(req, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      console.log(req.green);
      var book = new xmldoc.XmlDocument(body).children[0];
      //console.log(book);
      book.eachChild(function(child, index, array){
        //console.log(child.toString());
        var ch = child.childrenNamed('AuthorsText')[0].val;
        if (ch.match(meta.author)) console.log(ch);
      });

      return;




      //.children[0].children[0];
      var m = {};

      //console.log(book);

      //console.log(book.children[3]['val']);
      m.isbn = book['attr']['isbn'];
      m.isbn13 = book['attr']['isbn13'];
      m.book_id = book['attr']['book_id'];
      m.publisher = book.children[3]['val'];
      console.log(m);





    }
  });
  */
  return meta;
}

function filter_text_cleanup(data, meta) {
  // standardize the text for easy search
  // make returns /n only an no spaces
  // remove multiple spaces

  data = data.replace( /\r/g, '' ); // get rid of carriage return
  data = data.replace( /  +/g, ' ' ); // git rid of multiple spaces
  data = data.replace(/ *?\n|\n *?/g, '\n'); // spaces before or after return
  data = data.replace(/\n\n[\n]*?/g, '\n\n'); // more than two returns
  data = data.replace(/\n+(\[[0-9] )/g, ' $1'); // remove line breaks before footnotes

  return data;
}
function filter_bahai_words(data, meta) {
  data = insert_transliteration_slugs(data);
  return data;
}
function filter_footnotes(data, meta) {
  var match = [], pars = [], notes = [], notedata = {}, par='',
      // regex = /<p[\s\S]*?<\/p>/ig;
      regex = /.*?\n\n/g;

  while ((match = regex.exec(data)) !== null) if (match[0].indexOf('[1]')>-1) {
     pars.push([match[0], match['index'], match[0].length]);
  }
  // work through the list backwards, run the replace list from longest to shortest
  for (var i=pars.length-1; i>=0; i--) {
    notes = []; ninfo = [];
    par = pars[i][0];
    regex = /\[([0-9]+)\]/g;
    while ((match = regex.exec(par)) !== null) notes.push([ match[1], match['index'], match[0].length ]);
    regex = /\[([0-9]+) ([^\]]*?)\]/g;
    while ((match = regex.exec(par)) !== null) notedata[match[1]] = [ match[2].trim(), match['index'], match[0].length ];
    // step through notes backwards, replacing them
    for (var j=notes.length-1; j>=0; j--) {
      ninfo = notedata[ notes[j][0] ]; // the information part
      if (typeof ninfo === 'undefined') continue;
      par = par.substr(0, ninfo[1]) + par.substr(ninfo[1] + ninfo[2]);
      par = par.replace(/[\s]*?<\/p>/, ' </p>');
    }
    // step through references backwards, replacing them
    for (j=notes.length-1; j>=0; j--) {
      ninfo = notedata[ notes[j][0] ]; // the information part
      if (typeof ninfo === 'undefined') continue;
      var wordcount = ninfo[0].split(' ').length;
      var class_notelen = (wordcount<4 ? 'short' : (wordcount<20 ? 'med' : 'long'));
      par = par.substr(0, notes[j][1]) + " <span class='note "+ class_notelen +"'> "+ ninfo[0] +" </span> " + par.substr(notes[j][1] + notes[j][2]);
    }
    // now replace par in data
    data = data.substr(0, pars[i][1]) + par + data.substr(pars[i][1] + pars[i][2]);
  }
  return data;
}
function filter_subheads(data, meta){
  var lines = data.replace(/\r/g,'').split("\n");
  var mode_subheader = false;
  for (var i=0; i<lines.length; i++) {
    var line = _.trim(lines[i], '#').trim();

    // identify section headings in raw text
    if (line_type(line) == 'section-break') {
      mode_subheader = true;
      lines[i] = ''; continue;
    }
    if (mode_subheader && (line.length>1) && (line.length<80) ) {
      lines[i] = "\r\n<h3 class='section_title'> "+ line + " </h3>";
      mode_subheader = false;
      continue;
    }
    if (line_type(line) == 'section-title') {
      // section was defined in markdown or HTML

    }

    if (line_type(line) === 'subhead') {
      // TODO
      // what if source is HTML?? should we preserve the existing class?
      // what if line is markdown? shoud we check for a data value like {{author=abd}}
      lines[i] = "\r\n<h5 class='subhead'> " + line +" </h5>";
      continue;
    }
    if (line_type(line) === 'note') {
      // TODO
      // what if source is HTML?? should we preserve the existing class?
      // what if line is markdown? shoud we check for a data value like {{author=abd}}
      lines[i] = "\r\n<p class='ref'> " + line +" </p>";
      continue;
    }


  }
  data = lines.join("\r\n");
  return data;
}
function filter_dates(data, meta){
  var lines = data.replace(/\r/g,'').split("\n");
  for (var i=0; i<lines.length; i++) {
    var line = lines[i].trim();
    if (line_type(line) === 'date') {
      var date = new Date(strip_punctuation(strip_html(line)).trim()).toFormat('YYYY-MMM-DD');
      line = line.replace("[", '').replace("]", '');// ??
      lines[i] =  "<p class='date' data-date='"+ date +"'>" + line;
      continue;
    }
  }
  data = lines.join("\r\n");
  return data;
}
function filter_pagemarkers(data, meta) {
  var newdata = data.replace(/<p([0-9]+)>/g, " <span data-pg='$1'></span> ");
  return newdata;
}

function filter_markdown(data, meta) {
  // note, by convention, all h3 will become snumbered ections, all h4 will be .subheaders
  data = String(data).replace(/\t/g, '\n\n ');
   /* marked.setOptions({
      gfm: true,
      tables: true,
      breaks: true,
      pedantic: true,
      sanitize: false,
      smartLists: true,
      langPrefix: 'language-'
    });*/
  data = marked(data);
  // data = data.replace(/<\/p>/g, ''); // remove closing </p>
  data = data.replace(/<p>/g, '\n<p> '); // space before par
  data = data.replace(/&#39;/g, "'"); // leave in single quotes
  data = data.replace(/&quot;/g, '"'); // leave in double quotes

  data = data.replace(/<h3>/g, "<h3 class='section_title'> "); // split these into sections later
  data = data.replace(/<h4>/g, "<h4 class='subhead'> "); // split these into sections later
  data = data.replace(/<p>[\s]?<p/g, "<p"); // extra open <p> tags
  data = data.replace(/\s--\s/g, "&mdash;"); // M dash

  // clean up whitepace
  data = data.replace(/\r\n/g, "\n");
  data = data.replace(/\r/g, "\n");
  data = data.replace(/\n[ \t]*/g, "\n");
  data = data.replace(/[ \t]*\n/g, "\n");
  data = data.replace(/(<h|<section|<p|<div|<ol|<ul)/g, "\n\n$1"); // add some space before blocks
  data = data.replace(/\n\n[\n]*/g, "\n\n"); // remove all but one blank line
  data = data.replace(/(<h|<section)/g, "\n\n$1"); // add extra blank line before sections and headers
  data = data.replace(/[\s]*?<\/p>/g, " </p>"); // make sure there is one space before </p>
  data = data.replace(/[ ]+/g, " "); // make all multiple spaces one
  data = data.replace(/\n/g, "\r\n");

  return data;
}
function filter_quotes(data, meta) {
  function quote_author(par, quotes, index, prev_author) {
    // does the quote have author identification?
    var quote = quotes[index],
        areg = /{auth:([a-z]*?)}/i;
    //console.log(quote);
    if ((match = areg.exec(quote.text)) !== null) {
      //console.log("author tag found");
      //console.log(match);
      return match[1].trim().toLowerCase();
    }
    // do we have a previous author?
    if (prev_author) return prev_author;
    // is there an author mentioned in the non-quote text?
    var authors = {
      'baha': [translitertion_slug('Bahá’u’lláh'),translitertion_slug('Kitáb-i-Aqdas'),translitertion_slug('Kitáb-i-Íqán'), 'Epistle'],
      'abd' : [translitertion_slug('‘Abdu’l-Bahá'), 'Tablets', 'Center of the Covenant', 'Divine Plan'],
      'bab' : [translitertion_slug('Báb'), 'Forerunner', translitertion_slug('Bayán'), translitertion_slug('Qayyúmu’l-Asmá’')],
      'shoghi': ['Shoghi', 'Guardian']
    };
      // strip out quotes from par first
    var par_stripped = par, justquotes = '';
    for (var i=0; i<quotes.length; i++) {
      var q = quotes[i];
      par_stripped = par_stripped.substr(0, q.start) + _.repeat(' ', q.length) + par_stripped.substr(q.start+q.length);
      justquotes += ' ' + q.text;
    }

    //if (par.match("Not ours, however")) console.log("stripped par: ".red + par_stripped.green);
      // then search for any author names

    var found = {
      'baha': false,
      'abd' : false,
      'bab' : false,
      'shoghi': false};
    // find matches for each author
    var author='', item='';
    for (author in authors) for (i=0; i<authors[author].length; i++) {
      item = authors[author][i];
      if (par_stripped.indexOf(item)>-1) found[author] = true;
    }
    // eliminate author if mentioned in a quote
    for (author in authors) for (i=0; i<authors[author].length; i++) {
      item = authors[author][i];
      if (justquotes.indexOf(item)>-1) found[author] = false;
    }
    for (author in authors) if (found[author]) return author;


    return 'unknown';
  }




  var match = [], pars = [], par='', endPos = -1;
      regex = /<p[\s\S]*?<\/p>/ig;
  while ((match = regex.exec(data)) !== null) if (match[0].indexOf('"')>-1) {
     pars.push([match[0], match['index'], match[0].length]);
  }
  //console.log("Found "+ pars.length+ " paragraphs with quotes. ");

  // work through the list backwards, run the replace list from longest to shortest
  for (var i=pars.length-1; i>=0; i--) {
    par = pars[i][0];
    // note: it might be wise to remove all html tags, leaving space and then calculate quote
    // replacemnts on a block of text with no tags. Otherwise we need to enforce the rule of no
    // double quotes in tag attributes
    var qregx = /"/g, qs = [], quotes = [];
    match = [];
    while ((match = qregx.exec(par)) !== null) qs.push(match['index']);
    var isEven = (qs.length % 2 === 0) ? true : false;
    if (!isEven) {
      regex = /[^\s][\s]*?<\/p>/ig;
      match = regex.exec(par);
      endPos = (match !== null) ? match['index'] +1 : par.length;
    }
    // build a list of replacements, two quotes at a time
    for (var j=0; j<qs.length; j+=2) {
      var qfrom = qs[j];
      var qto = (j<qs.length-1) ? qs[j+1]+1 : endPos;

      quotes.push({ 'text': par.substring(qfrom, qto), 'start': qfrom, 'length': qto-qfrom });
    }
    // establish author of each quote
    var author = '';
    for (j=0; j<quotes.length; j++) {
      author = quote_author(par, quotes, j, author);
      quotes[j].author = author;
    }
    // do the replacements walking backwards throught the list
    var quote ='', newquote='';
    for (j=quotes.length-1; j>=0; j--) {
      quote = quotes[j];
      newquote = "<q class='"+ quote.author +"'>&ldquo;" + _.trim(quote.text, '"').replace(/{auth:([a-z]*?)}/i, '') +'&rdquo;</q>';
      par = par.substr(0, quote.start) + newquote + par.substr(quote.start + quote.length);
     // console.log("Newquote par: "+ par.green);
    }
    data = data.substr(0, pars[i][1]) + par + data.substr(pars[i][1] + pars[i][2]);
  }
  return data;
}
function filter_numbering(data, meta) {
  //console.log('filter_numbering, meta.numbering=' + meta.numbering.red);
  var lines = data.replace(/\r/g,'').split("\n");
  var sec_num=0, par_num=0, id='', section='', p='';
  var section_regex = /<h3[^>]+class=[\'|\"]section_title[\'|\"][^>]*?>/i;
  var par_regex = /<p[^>]?>/i;

  for (var i=0; i<lines.length; i++) {
    var line = lines[i].trim();

    if (line.match(section_regex) && (meta.numbering === 'sections')) {
      sec_num++; par_num=0;
      id = meta.acronym.toLowerCase() + '_' + sec_num;
      section = "<h3 class='section_title' id='"+id+"'>";
      lines[i] = line.replace(section_regex, section);
      //console.log('Numbered section '+ section.green);
      continue;
    }

    if ((meta.numbering!='none') && line.match(par_regex) && (line_type(line)==='par')) {
      par_num++;
      id = meta.acronym.toLowerCase() + '_' + (sec_num? sec_num+'.':'') + par_num;
      p = "<p id='"+id+"'>";
      lines[i] = line.replace(par_regex, p);
      //console.log("Line '"+ line.substring(0,10).green +"' -> "+ line_type(line).green);
      continue;
    }

  }

  data = lines.join("\r\n");
  return data;
}
function filter_typography(data, meta) {

   return data;
}
function apply_html5_template(data, meta) {
  var page = fs.readFileSync('html5-wrapper.html', 'utf-8');
  for(var find in meta){
    var re = new RegExp('{'+find+'}', 'g');
    //regex = new RegExp(vowel, "g");
    page = page.replace(re, meta[find]);
  }

  page = page.replace(/{document}/g, data);

  return page;
}

function parse_html_blocks(data) {
  var matches = [],
      regex = /<p[\s\S]*?<\/p>|<h[\s\S]*?<\/h[1-6]+>|<div[\s\S]*?<\/div>|<ol[\s\S]*?<\/ol>|<ul[\s\S]*?<\/ul>|<table[\s\S]*?<\/table>|<article[\s\S]*?<\/article>|/ig;
  while ((match = regex.exec(data)) !== null) {
    matches.push({ 'text': match[0],
                   'start': match['index'],
                   'length': match[0].length,
                   'tag': _.trim(match[0].trim().split(' ')[0], '<') });
  }
  return matches;
}

function read_transliteration_list() {
  var raw = fs.readFileSync('bahai-words-list.txt', 'utf-8');
  raw = raw.replace(/\r\n/g, '\n');
  var list = raw.split("\n");
  var newlist = [];
  list.map(function(word, i) {
    word = word.trim();
    if (word.indexOf('//')>0) {
      word = word.split('/')[0].trim(); // remove comment part of line
    }
    if (word.length > 1 && (!_.startsWith(word, '//'))) newlist.push(word);
  });

  // for quick testing  '‘Akká', '‘Abdu’l-Bahá',
  //newlist = [ 'Ma<u>sh</u>riqu’l-A<u>dh</u>kar' ];

  return  _.uniq(newlist);
}
function transliterate_test() {
 /* console.log ("stripping accents: ḥájís -> " + strip_accents('ḥájís').green.bold);
  console.log ("stripping utf8: ḥájís -> " + strip_utf8('ḥájís').green.bold);
  console.log ("stripping html: Á<u>dh</u>irbayján -> " + strip_html('Á<u>dh</u>irbayján').green.bold);
  console.log ("stripping html: ‘Abdu’l-‘Aẓím -> " + strip_utf8('‘Abdu’l-‘Aẓím').green.bold);

  console.log("Transliteration slug: ‘Abdu’l-‘Aẓím -> {"+ translitertion_slug("‘Abdu’l-‘Aẓím") +'}');

  console.log("Strip suffixes: Dishes, Mullas, people's, cars. : "+ strip_suffixes('Dishes').red +
    ', '+  strip_suffixes('Mullas').red +', '+ strip_suffixes("people's").red +
    ', '+  strip_suffixes("cars.").red
  );

  console.log("Add replacements for some words: ‘Abdu’l-‘Aẓím, Baṭḥá, Bayán: ");
  console.log(
    transliterate_replacement_list('‘Abdu’l-‘Aẓím').
    concat(transliterate_replacement_list('Baṭḥá').
    concat(transliterate_replacement_list('Bayán')))
  );
  //console.log(replacements);
  */

  /*
  console.log("\n=======================\nToken Test: \n".bold);
  console.log(wordtoken("'Abdu'l-Baha,", 0));
  console.log(wordtoken('"test-word\'with-apos\'"', 0));
  console.log(wordtoken('ABigoleword...!?', 0));
  */
  //  return;



  //var phrase = 'This is a test of a Baha\'i word, about Bayan or Bayans or the Bab or Babis or Baha\'is!!';
  /*var phrase = " Bahais Baha'i Baha'is. \n"+
               " Baha'u'llah Bahaullah Bahaullah's Baha'o'llah's. \n"+
               " Abdu'l-Baha Abdu'l-Baha's 'Abdu'l-Baha. \n"+
               " Bab Babi Babiyyih Babi's. \n"+
               " Land of Ta, Tihran, Tanzanian, Tablet of Ahmad. \n"+
               " Iraq, Iraqi, Iraqis Iraq's \n"+
               " Akka, 'Akka, \n"+
               " Ya-Baha’u’l-Abha, Ya-Baha'u'l-Abha \n"+
               " Aghsan, Afnan \n"+
               " Kitab, Kitab-i-Iqan, Kitab-i-Aqdas \n"+
               " Qayyum-i-Asma, Qayyum-i-Asma', \n"+
               " Mashriqu’l-Adhkar Mashriqu'l-Adhkars.  (words with underscores) \n"+
               " Mashhad, Mashhadi \n"; // fails

  console.log("\n=======================\nTest Phrases: \n".bold + phrase.green);
  console.log(insert_transliteration_slugs(phrase));


  console.log("test of strip_punctuation_except_apos:");
  console.log("'Akka, 'Asma'. -> "+ strip_punctuation_except_apos("'Akka,") +
    " "+  strip_punctuation_except_apos("'Asma'."));


  console.log("test of strip_punctuation:");
  console.log("'Akka, 'Asma'. -> "+ strip_punctuation("'Akka,") +
    " "+  strip_punctuation("'Asma'."));

  */

  //return;

  var phrase = " Bahais Baha'i Baha'is. \n"+
               " Baha'u'llah Bahaullah Bahaullah's Baha'o'llah's. \n"+
               " Abdu'l-Baha Abdu'l-Baha's 'Abdu'l-Baha. \n"+
               " Bab Babi Babiyyih Babi's. \n"+
               " Land of Ta, Tihran, Tanzanian, Tablet of Ahmad. \n"+
               " Iraq, Iraqi, Iraqis Iraq's \n"+
               " Akka, 'Akka, \n"+
               " Ya-Baha’u’l-Abha, Ya-Baha'u'l-Abha \n"+
               " Aghsan, Afnan \n"+
               " Kitab, Kitab-i-Iqan, Kitab-i-Aqdas \n"+
               " Qayyum-i-Asma, Qayyum-i-Asma', \n"+
               " Mashriqu’l-Adhkar Mashriqu'l-Adhkars. \n"+
               " Mashhad, Mashhadi \n";
               '';

  console.log(phrase.green);
  console.log(insert_transliteration_slugs(phrase));
}

function insert_transliteration_slugs(str) {
  var replacement_count = 0;
  var KEYLEN = 4;

  // build index by first two letters
  var key = [], li = {};
  for (var k=0; k<replacment_list.length; k++) {
    key = strip_punctuation(strip_html(strip_utf8(replacment_list[k][1]))).trim().toLowerCase().substr(0, KEYLEN);
    if (typeof li[key] === 'undefined') li[key] = [];
    li[key].push([replacment_list[k][0], replacment_list[k][1]]);
  }

  // gather index of all words in str
  var match = [], words = [],regex = /[\S]+/g;
  while ((match = regex.exec(str)) !== null) words.push([match[0], match['index']]);
  // work through the list backwards, run the replace list from longest to shortest
  for (var j=words.length-1; j>=0; j--) {
    var token = wordtoken(words[j][0], words[j][1]);

    key = token.wordstemmed.toLowerCase().substr(0, KEYLEN);
    if (typeof li[key] != 'undefined') for (var i=0; i<li[key].length; i++) {
      //var find = replacment_list[i][0];
      var find = li[key][i][0],
          repl = li[key][i][1];
      var find_upper = find.toUpperCase();
      var newword = '';

      if (token.word===find || token.wordwithapos===find || token.wordstemmed===find) {
        newword = token.raw.replace(find, repl);
        str = str.substring(0, token.index) + newword + str.substring(token.index + token.raw.length, str.length);
        replacement_count++;
        break;
      }
      if (token.word===find_upper || token.wordwithapos===find_upper || token.wordstemmed===find_upper) {
        newword = token.raw.replace(find_upper, repl.toUpperCase());
        str = str.substring(0, token.index) + newword + str.substring(token.index + token.raw.length, str.length);
        replacement_count++;
        break;
      }
    }
  }

  console.log("Total replacements: ".bold +  String(replacement_count).red);
  return str;
}
function insert_transliteration_utf8(str) {
  //console.log(replacment_list);
  // loop through every word in text
  var regex = /[^\s]+/g,
      words = [],
      match = [];
  // gather index of all words in str
  while ((match = regex.exec(str)) !== null) words.push([match[0], match['index']]);
  // work through the list backwards, run the replace list from longest to shortest
  for (var j=words.length-1; j>=0; j--) {
    //console.log('Looking for replacement for: ' + words[j][0].red);
    var token = wordtoken(words[j][0], words[j][1]);
    //console.log(token);
    for (var i=0; i<replacment_list.length; i++) {
      var find = replacment_list[i][0];
      //console.log('Testing match of: '+find.red);
      if (token.word===find || token.wordwithapos===find || token.wordstemmed===find) {
        //console.log("Found match, replacing word: "+ find.green + " with slug: "+ replacment_list[i][1]);
        var newword = token.raw.replace(find, replacment_list[i][1]);
        //console.log("New word: "+ newword.green);
        str = str.substring(0, token.index) + newword + str.substring(token.index + token.raw.length, str.length);
        break;
      }
    }
  }
  //console.log("\n");
  return str;
}

// a raw token is delimited by spaces
// a processed token has a start index, raw block, word, alphastart, alphalength
function wordtoken(word, start_index) {
  var token = {};
  token.raw = word;
  token.index = start_index;
  token.word = strip_punctuation(token.raw);
  token.alphastart = word.indexOf(token.word);
  token.alphalength = token.word.length;
  token.wordwithapos = strip_punctuation_except_apos(token.raw);
  token.wordstemmed = strip_prefixes(strip_suffixes(token.word));
  token.firstletter = token.wordstemmed.substr(0,1);
  return token;
}
function line_type(line) {
  // generic test to identify line type
  // current possibilities:
  //   paragraph, section, subhead, date, signature etc.
  if (line.trim() === '') return 'empty';

  // headers, subbeaders, title
  if (_.startsWith(line, '# ')) return 'title';
  if (_.startsWith(line, '## ')) return 'subtitle';

  // sections
  if (_.startsWith(line, '================')) return 'section-break';
  if (_.startsWith(line, '### ') || _.startsWith(line, '<section') || _.startsWith(line, '<h3')) return 'section-title';

  // subheaders
  if (_.startsWith(line, '#### ')) return 'subhead';
  if ((line===line.toUpperCase()) && (line.length>2) && (line.length<100) &&
      !_.startsWith(line, '[') &&   !_.startsWith(line, '#')) return 'subhead';

  // meta-data
  if (_.startsWith(line, '<!-- meta-start')) return 'meta-start';
  if (_.startsWith(line, 'meta-end -->')) return 'meta-end';

  // mode-data
  if (_.startsWith(line, '{{')) return 'mode-data';  // such as author, section number etc.

  // line contents is date
  if ((line.trim().length < 20) && Date.parse(strip_punctuation(strip_html(line)).trim())) return 'date';

  // line contents is note
  if (_.startsWith(strip_html(line).trim(), '[') || _.startsWith(strip_html(line).trim(), '(')) return 'note';  // such as author, section number etc.

  if (strip_html(line).trim().length > 10) return 'par';

  return 'unknown';
}



// other prototypes
// transliterate_to_ascii
// transliterate_add_placeholders
// tranliterate_placeholder_to_html
// transliterate_placeholder_to_ansi
//
//
function transliterate_replacement_list(items) {
  if (typeof(items) === null) return;
  if (typeof(items) === 'string') items = [items.trim()];
  var replace = {};

  for (var i=0; i<items.length; i++) {
    var full = items[i].trim();
    var slug = translitertion_slug(full);

    // include full
    replace[full] = slug;
    // include html tags
    var html_ansi = strip_utf8(full);
    replace[html_ansi] = slug;
    // utf8 but no html
    var utf8 = strip_html(full);
    replace[utf8] = slug;
    // ansi only version
    var ansi = strip_html(html_ansi);
    replace[ansi] = slug;
    // vanilla ascii version
    var ascii = strip_accents(ansi);
    replace[ascii] = slug;
    // version with no outer apostrophes
    var edgeapostrophe = strip_punctuation(ascii);
    replace[edgeapostrophe] = slug;
    // version with no inner apostrophes
    var noapostrophe = edgeapostrophe.replace(/\'/g, '');
    replace[noapostrophe] = slug;

    // other common misspellings here
    // u is o
    var redboat = ascii.replace(/u/g, 'o');
    replace[redboat] = slug;
    // ' is -
    var redboat2 = ascii.replace(/'/g, '-');
    replace[redboat2] = slug;
    // both
    var redboat3 = redboat.replace(/'/g, '-');
    replace[redboat3] = slug;


  }
  // translate into array
  var replace_array = [];
  for (var key in replace) replace_array.push([key, replace[key]]);

  // sort from longest to shortest
  replace_array = replace_array.sort(function(a, b) {
    return b[0].length - a[0].length;
  });

  return replace_array;
}
function strip_suffixes(word) {
  var suffixes = ['ings', 'ing', "'s", "’s", 'es', 's'];
  for (var i=0; i<suffixes.length; i++) {
    //console.log('checking word "'+word+'" against ending "'+suffixes[i]+'"');
    if (_.endsWith(word, suffixes[i])) {
      return word.substring(0, word.length - suffixes[i].length);
    }
  }
  return word;
}
function strip_prefixes(word) {
  var prefixes = ['non-', 'Non-'];
  for (var i=0; i<prefixes.length; i++) {
    //console.log('checking word "'+word+'" against ending "'+suffixes[i]+'"');
    if (_.startsWith(word, prefixes[i])) {
      word = word.substring(prefixes[i].length, word.length);
      //console.log('trimmed prefix '+prefixes[i].red+' from word: '+ word.green);
      return word;
    }
  }
  return word;
}
function suffix_replacements(word, slug) {
  var suffix = ['ings', 'ing', 'ans', 'an', "'s", "’s", 'es', 's'];
  var replacements = [];
  for (var i=0; i<suffix.length; i++) {
    replacements.push([word+suffix[i], slug+suffix[i]]);
  }
  replacements.push([word, slug]);
  return replacements;
}
function strip_accents(str) {
  var in_chrs =  'ąàáäâãåæćęèéëêìíïîłńòóöôõøùúüûñçżźĄÀÁÄÂÃÅÆĆĘÈÉËÊÌÍÏÎŁŃÒÓÖÔÕØÙÚÜÛÑÇŻŹ',
      out_chrs = 'aaaaaaaaceeeeeiiiilnoooooouuuunczzAAAAAAAACEEEEEIIIILNOOOOOOUUUUNCZZ',
      transl = {};
  eval('var chars_rgx = /['+in_chrs+']/g');
  for(var i = 0; i < in_chrs.length; i++){ transl[in_chrs.charAt(i)] = out_chrs.charAt(i); }
  return str.replace(chars_rgx, function(match){return transl[match]; });
}
function strip_utf8(str) {
  // ÁáÍíÚúṬṭḤḥṢṣḌḍẒẓ
  var in_chrs =  "ẓḥṭṣḍẒḤṬṢḌ‘’",
      out_chrs = "zhtsdZHTSD''",
      transl = {};
  eval('var chars_rgx = /['+in_chrs+']/g');
  for(var i = 0; i < in_chrs.length; i++){ transl[in_chrs.charAt(i)] = out_chrs.charAt(i); }
  return str.replace(chars_rgx, function(match){
      return transl[match]; });
}
function strip_html(str) {

  return str.replace(/<(?:.|\n)*?>/gm, '');
}
function translitertion_slug(str){
  // what if we use an old glyph like style
  // Ri.dv^an Rid.va^n, Dh_a^bih, Tih.ra^n
  // Ridvaan, Dhaabih, Tihraan, Kitaab-i-IIqaan
  // áúíÁÚÍ
  var vowels = ['á', 'ú', 'í', 'Á', 'Ú', 'Í'];
  vowels.map(function(vowel){
    var regex = new RegExp(vowel, "g");
    var repl = strip_accents(vowel);
    str = str.replace(regex, repl);
  });

  str = strip_html(strip_accents(strip_utf8(str)));
  //str = str.replace(/'/g, '');
  str = strip_punctuation(str);
  return  '{'+ str +'}' ;
}
function strip_punctuation(str){ // removes punctuation (including single quotes) outside word
  //return str.replace(/\b[-.,()&$#!\[\]{}"'\?]+\B|\B[-.,()&$#!\[\]{}"'\?]+\b/g, "");
  return str.replace(/^[^a-zA-Z0-9\-]+|[^a-zA-Z0-9\-]+$/g, "");
}
function strip_punctuation_except_apos(str) {

  return str.replace(/^[^a-zA-Z0-9\-']+|[^a-zA-Z0-9\-']+$/g, "");
}
function rebuildReplacementsJS(){
  //  [ 'Abbas',                        '‘Abbás' ],
  // template file is replacements.js.template
  // output file is replacements.js
  // url is http://dl.dropbox.com/u/382588/JS/Projects/textconversion/test%20nodejs/test1/ocn2md/replacements.js
  var template = fs.readFileSync('replacements.js.template', 'utf-8');
  var list = [];
  transliteration_list.map(function(full) {
    var slug = strip_punctuation_except_apos(translitertion_slug(full));
    var item = '  [ "'+ slug + '",';
     item = item + _.repeat(' ', 40-item.length) + '"'+ full +'" ]';
    list.push(item);
  });
  var replacements = list.join(',\n');
  //console.log(replacements);
  var output = template.replace("{{replacements}}", replacements);
  fs.writeFile("replacements.js", output, function(err) {
    if(err) console.log(err);
    console.log("Output new replacements.js file: "+ "replacements.js".green);
  });

  // rebuild replacements.txt after sorting
  list = transliteration_list;
  //list.map(function(item, index) {list[index] = strip_punctuation(strip_html(strip_utf8(strip_accents(item))));});
  output = "\n\n// special characters \n// Á á Í í Ṭ ṭ Ḥ ḥ Ṣ ṣ Ḍ ḍ Ẓ ẓ Ú ú ’ ‘ \n\n";
  output += list.sort(function(a,b){
    a = strip_punctuation(strip_html(strip_utf8(strip_accents(a)))).toLowerCase();
    b = strip_punctuation(strip_html(strip_utf8(strip_accents(b)))).toLowerCase();
    if(a<b) return -1;
    if(a>b) return 1;
    return 0;
  }).join("\n") + output;

  fs.writeFile("bahai-words-list-sorted.txt", output, function(err) {
    if(err) console.log(err);
    console.log("Output new sorted words list file: "+ "bahai-words-list-sorted.txt".green);
  });
}
function slug_replacement_list() {
  // build a slug replacement list
  var list = {};
  transliteration_list.map(function(full) {
    var slug = translitertion_slug(full);
    list[slug] = full;
  });
  return list;
}

function wordwrap( str, width, brk, cut ) {
  brk = brk || '\n';
  width = width || 75;
  cut = cut || false;
  if (!str) { return str; }
  var regex = '.{1,' +width+ '}(\\s|$)' + (cut ? '|.{' +width+ '}|.+$' : '|\\S+?(\\s|$)');
  return str.match( RegExp(regex, 'g') ).join( brk );
}


