//const http = require("http");
const path = require("path");
const fs = require("fs");
const child = require('child_process');
const process = require('process');
const express = require('express');
const cors = require ('cors');
const fileUpload = require('express-fileupload');
const bodyParser = require('body-parser');
const mime = require('mime-magic');
const http = require('http');
const https = require('https');
const forceSsl = require('express-force-ssl');

const port = 3000;

var key = fs.readFileSync('../ssl/keys/e1b7c_21d05_9ea8c04c2c7145fee7301d5be2dd8873.key');
var cert = fs.readFileSync( '../ssl/certs/sar_announcements_com_e1b7c_21d05_1525337882_f67e590f57e06ddcf5f5ced9bab4e4a2.crt' );
//var ca = fs.readFileSync( '../ssl/certs/sar_announcements_com_eb53b_64655_1549100876_7746f2c803c3577300d5015ad0e5b6b6.crt' );

var sslOptions = {
  key: key,
  cert: cert
//  ca: ca
};

const app = express();

// default options
app.use(fileUpload());
app.use(bodyParser.json({limit: '50mb'}));
app.use(forceSsl);
app.options('*', cors());


function replaceToolsWithImages(md) {
    let re = /!{(.*)}/g;
    let insertedImages = md.replace(re, function (m, p1) { return `![](${p1})`; });
    return insertedImages;
}

// function replaceImagesWithTools(md) {
//     let re = /!\[(\w+)\]\((\w+)\)/g;
//     let insertedTools = md.replace(re, function (m, p1, p2) { return `!{${p2}}`; });
//     return insertedTools;
// }

app.post('/upload', function(req, res) {
    res.header('Access-Control-Allow-Origin', "*");

    if (!req.files)
	return res.status(400).send('No files were uploaded.');

    
    let uploadFile = req.files.uploadFile;
    let type = uploadFile.mimetype;
    
    if ((type == "image") || (type == "audio") || (type == "video")) {
	
	uploadFile.mv('files/' + uploadFile.name, function(err) {
	    if (err) {
		return res.status(500).send(err);
//	    } else return res.send("http://localhost:3000/" + uploadFile.name);
	    } else return res.send(uploadFile.name);
	});
    } else {
	return res.status(500).send("Wrong file type");
    }
});

app.post('/uploadAngular', function(req, res) {
    if (!req.files) 
	return res.status(400).send('No files were uploaded.');

    let uploadFile = req.files.uploadFile;
    let localPath = 'files/' + uploadFile.name;

	let makeResult = function ( mimetype ) {
		let uploadUrl = 'http://localhost:3000/' + uploadFile.name;
		let result = JSON.stringify({ 'url': uploadUrl, 'mime' : mimetype });
		
		res.header('Access-Control-Allow-Origin', "*");
		return res.send(result);
	}

    uploadFile.mv( localPath , function(err) {
		if (err) {
			// no file
		    return res.status(500).send(err);
		} else {
			// copy succeeded, now check mime:
			mime(localPath, function (err, type) {
    			if (err) {
    				// couldn't get mime
        			console.error(err.message);
        			// ERROR: cannot open `/path/to/foo.pdf' (No such file or directory) 
    			} else {
        			console.log('Detected mime type: %s', type);
        			return makeResult(type);
        		}
        	});

		}
	});

});


app.post('/import', function(req, res) {
  res.header('Access-Control-Allow-Origin', "*")

  if (!req.files)
    return res.status(400).send('No files were uploaded.');
 
  // The name of the input field (i.e. "sampleFile") is used to retrieve the uploaded file
    let convertFile = req.files.convertFile;
    let type = convertFile.mimetype;
    let correctType = false;
    let converted = {};
    if ((type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document") ||
	(type == "application/msword") ||
	(type == "application/vnd.oasis.opendocument.text")) {
	correctType = true;
    }
    
    if (correctType) {
	// Use the mv() method to place the file somewhere on your server
	convertFile.mv('files/' + convertFile.name, function(err) {
	    if (err) 
		return res.status(500).send(err);
	    
	    console.log(convertFile.name);
	    
	    let oldFiles = fs.readdirSync('files/mediatmp/media');
	    oldFiles.forEach(f => fs.unlinkSync(path.join('files/mediatmp/media/',f)));
	    
	    
	    child.exec(`pandoc "files/${convertFile.name}" --to=markdown --extract-media=files/mediatmp`, (error, stdout, stderr) => {
	    	if (error) {
	    	    return res.status(500).send(err);
	    	} else {	    
	    	    converted.markdown = stdout;
		    let newFiles = fs.readdirSync('files/mediatmp/media');
		    converted.media = newFiles.map(f => path.join('mediatmp/media',f));
		    return res.send(converted);
	    	    //return converted;
	    	}
	    });

	    
	    // process.stdout.on('data', function (output) {
	    // 	converted.markdown = output;
	    // 	let newFiles = fs.readdirSync('files/mediatmp/media');
	    // 	console.log(newFiles);
	    // 	converted.media = newFiles.map(f => path.join('mediatmp/media',f));
	    // 	return res.send(converted);
	    // });
	    
	    
	});
    } else {
	return res.status(500).send("Wrong file type");
    }
});


app.post('/export/:type', function(req, res) {
    let md = req.body.markdown;
    md = replaceToolsWithImages(md);
    let type = req.params.type;

    console.log("calling pandoc");
    let pandoc = child.exec(`pandoc -s --from=commonmark -o files/converted.${type}`, function(err, result) {
	if (err) return console.log(err);
	console.log(result);
    });
    pandoc.stdin.setEncoding('utf-8');
    pandoc.stdin.write(md);
    pandoc.stdin.end();


    if (req.method === "OPTIONS") {
	res.header('Access-Control-Allow-Origin', req.headers.origin);
    } else {
	res.header('Access-Control-Allow-Origin', '*');
    }
    res.header('Content-disposition', 'attachment; filename= "' + encodeURI(`converted.${type}`) +'"' );
    res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS");

    pandoc.on('exit', function() {
	console.log("sending file");
	return res.download(__dirname +`/files/converted.${type}`, `converted.${type}`, function(err){
	    if (err) {
		console.log(err);
		// Handle error, but keep in mind the response may be partially-sent
		// so check res.headersSent
	    } else {
		// decrement a download credit, etc.
	    }
	});;
    })

});
    
app.use(express.static('files', { maxAge: 100000, immutable: true}));

// app.listen(port, function () {
//   console.log(`NMH backend app listening on port ${port}!`);
// });
//http.createServer(app).listen();
https.createServer(sslOptions, app).listen(port);
