var debug = false;
var fs = require("fs");
var fm = require("./../index.js");
var path = require("path");
function error(msg, exit_code) {
  console.log(msg);
  process.exit(exit_code || 0);
};

function clear_dir(dir, ext) {
  var files = fs.readdirSync(dir);
  for (var file of files) {
    if (file.slice(-ext.length) === ext) {
      fs.unlinkSync(path.join(dir, file));
    }
  };
};

function load(dir = ".", ext = ".fm", parse = fm.lang.parse, exit_code = 0) {
  var files = fs.readdirSync(dir).filter(file => file.slice(-ext.length) === ext && file !== ext);
  if (files.length === 0) {
    error("No local " + ext + " file found.", exit_code);
  } else {
    var result = {files: {}, defs: {}};
    for (var file of files) {
      var file_code = fs.readFileSync(path.join(dir, file), "utf8");
      try {
        var parsed = parse(file_code,0);
        var file_defs = parsed.defs;
      } catch (err) {
        if (debug) console.log(err);
        error("\n\x1b[1mInside '\x1b[4m"+file+"\x1b[0m'"
             + "\x1b[1m:\x1b[0m\n" + err
             , exit_code);
      }
      for (var name in file_defs) {
        if (result.defs[name]) {
          error("Redefinition of '" + name + "' in '" + file + "'.", exit_code);
        } else {
          result.defs[name] = file_defs[name];
          result.files[name] = file_code;
        }
      }
    }
  }
  return result;
};

async function _fm_(
  main   = "main",
  dir    = ".",
  ext    = ".fm",
  parse  = fm.lang.parse,
  show   = fm.lang.stringify,
  synth  = fm.load.load_and_typesynth,
  norm   = fm.synt.normalize,
  silent = false
) {
  var exit_code = main === "--github" ? 1 : 0;
  var {defs, files} = load(dir, ext, parse, exit_code);

  // Normalizes and type-checks all terms
  if (!silent) console.log("\033[4m\x1b[1mType-checking:\x1b[0m");
  var errors = [];
  fm.synt.clear_hole_logs();
  for (var name in defs) {
    var show_name = name;
    try {
      var {term,type} = await synth(name, defs, show, true);
      if (!silent) console.log(show_name + ": \x1b[2m" + show(type) + "\x1b[0m");
    } catch (err) {
      if (debug) console.log(err);
      if (!silent) console.log(show_name + ": " + "\x1b[31merror\x1b[0m");
      if (typeof err === "function") {
        errors.push([name, err()]);
      } else {
        errors.push([name, "Internal error."]);
      };
    }
  };
  if (!silent) console.log("");

  // If there are errors, prints them
  if (errors.length > 0) {
    if (!silent) console.log("\033[4m\x1b[1mFound " + errors.length + " type error(s):\x1b[0m\n");
    for (var i = errors.length - 1; i >= 0; --i) {
      var err_msg = fm.lang.stringify_err(errors[i][1], files[errors[i][0]]);
      if (!silent) console.log("\x1b[1mInside \x1b[4m"+errors[i][0]+"\x1b[0m\x1b[1m:\x1b[0m");
      if (!silent) console.log(err_msg);
    };
  } else {
    if (!silent) console.log("\033[4m\x1b[1mAll terms check.\x1b[0m");
  };

  // If there are hole errors, prints them
  var hole_logs_len = Object.keys(fm.synt.HOLE_LOGS).length;
  if (!silent && hole_logs_len > 0) {
    console.log("\033[4m\x1b[1mFound " + hole_logs_len + " hole(s):\x1b[0m");
    for (var hole in fm.synt.HOLE_LOGS) {
      console.log("");
      console.log(fm.synt.HOLE_LOGS[hole]);
    };
  };

  // If user asked to evaluate main, do it
  if (!silent && defs[main] && defs[main].core) {
    console.log("");
    console.log("\033[4m\x1b[1mReducing '"+main+"':\x1b[0m");
    try {
      console.log(show(fm.synt.normalize(defs[main].core.term, defs, {}, true)));
    } catch (e) {
      if (debug) console.log(e);
      error("Error.", exit_code);
    }
  };

  // If there are errors or unresolved equations, exits with an error
  if (errors.length > 0) {
    error("", exit_code);
  }

  // Returns core defs
  var core_defs = {};
  for (var def in defs) {
    core_defs[def] = defs[def].core;
  };
  return core_defs;
};

async function _fmc_(main = "main", dir) {
  // Since we're storing fm-synt nat/string literals on .fmc files, in order to
  // get proper core terms, we parse .fmc using fm.synt and then convert to core
  function parse(code) {
    var {defs} = fm.synt.parse(code);
    for (var def in defs) {
      defs[def].term = fm.core.parse(fm.synt.stringify(fm.synt.canonicalize(defs[def].term, {}, true)), 0, "term");
      defs[def].type = fm.core.parse(fm.synt.stringify(fm.synt.canonicalize(defs[def].type, {}, true)), 0, "term");
    };
    return {defs};
  };
  await _fm_(main, ".", ".fmc", parse, fm.core.stringify, fm.synt.typesynth, fm.synt.normalize);
};

async function _js_(main = "main", dir, ext, parse, show, synth, norm) {
  var defs = await _fm_(main, dir, ext, parse, show, synth, norm, true);
  //var {defs} = load("./.fmc", ".fmc", fm.synt.parse);
  if (!defs[main]) {
    console.log("Term '" + main + "' not found.");
  } else {
    console.log(fm.tojs.compile(main, defs));
  };
};

function _hs_(main = "main", dir, ext, parse) {
  console.log("Temporarily disabled.");
  process.exit();
};

async function _io_(main = "main", dir, ext, parse, show, synth, norm) {
  var defs = await _fm_(main, dir, ext, parse, show, synth, norm, true);
  //var {defs} = load("./.fmc", ".fmc", fm.synt.parse);
  if (!defs[main]) {
    console.log("Term '" + main + "' not found.");
  } else {
    eval(fm.tojs.compile(main, defs));
  };
};

async function _x_(main = "main", dir, ext, parse, show, synth, norm) {
  var defs = await _fm_(main, dir, ext, parse, show, synth, norm, true);
  if (!defs[main]) {
    console.log("Term '" + main + "' not found.");
  } else {
    var result = fm.optx.normalize(defs[main].term, defs);
    console.log(fm.synt.stringify(result.term));
    console.log(JSON.stringify(result.stats));
  };
};

async function _fm2fmc_(main = "main", dir, ext, parse, show, synth, norm) {
  var defs = await _fm_(main, dir, ext, parse, show, synth, norm, true);
  var code = "";
  for (var name in defs) {
    code += code !== "" ? "\n\n" : "";
    code += name + ": ";
    code += fm.synt.stringify(defs[name].type) + "\n  ";
    code += fm.synt.stringify(defs[name].term) + "";
  };
  console.log(code);
};

module.exports = {load, _fm_, _fmc_, _io_, _js_, _hs_, _x_, _fm2fmc_};
