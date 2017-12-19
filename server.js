var http = require('http');
var https = require('https');
var fs = require('fs');
var express = require('express');
bodyParser = require('body-parser'),
path = require("path");
var async = require("async");

var app = express();



// Require the config file
// An example config file is included in this package for you as okta_config.json.example
var config = require('./okta_config.json');

// Create application/x-www-form-urlencoded parser
var urlencodedParser = bodyParser.urlencoded({ extended: false })


// We will use ejs as our template engine for create user responses
app.set('view engine', 'ejs');
app.use(express.static('static'));

//index page
app.get('/', function(req, res)
{
	var body = fs.readFileSync("views/partials/claim_form.ejs", "utf8");
	res.render('pages/index',
	{
		body:  body
	});

});

app.post('/', urlencodedParser, function(req, res, next)
{

	// Let's output what we got
  	for (var key in req.body) 
    		{ console.log(key + ": " + req.body[key]); }

	// Find the user by Primary Email
	var primaryEmail = req.body["email"]; 


	function updatePrimaryEmail(jsonData, args)
	{
		id = jsonData.id;
		secondaryEmail = jsonData.profile.secondEmail;

        	var client = new Client();
		args.data = { "profile": { "email": secondaryEmail } };
		
		// Update the primaryEmail from the value in the secondary Email
		client.post("https://" + config.host + "/api/v1/users/" + id, args, function (data, response)
		{	
			delete args["data"];  // Remove our submitted data for reuse
			unsuspendUser(jsonData, args);
		});

	}

	function unsuspendUser(jsonData, args)
	{
		id = jsonData.id;

        	var client = new Client();
		
		client.post("https://" + config.host + "/api/v1/users/" + id + "/lifecycle/unsuspend", args, function (data, response)
                {
			// Now we mark the user as Alumni
			markUserAsAlumni(jsonData, args);
                });
	
	}

	function markUserAsAlumni(jsonData, args)
        {
                id = jsonData.id;

                var client = new Client();
		args.data = { "profile": { "employeeType": "Alumni" } };

                // Unsuspend the user
                client.post("https://" + config.host + "/api/v1/users/" + id, args, function (data, response)
                {	
			delete args["data"];  // Remove our submitted data for reuse
			// Per known issue OKTA-142758 reset the users's password to something to place the user in the reactivated state  
                        resetPassword(jsonData, args);
                });

        }


        function resetPassword(jsonData, args)
        {
                id = jsonData.id;
		args.data = { "credentials": { "password" : { "value": "20GoldMedals" } } }

                var client = new Client();

		// Reset the password
                client.post("https://" + config.host + "/api/v1/users/" + id, args, function (data, response)
                {
			// Now we render our results
			renderResultsPage(jsonData, args);
                });

        }

	function renderResultsPage(jsonData, args)
	{
                console.log(jsonData, args);
		secondaryEmail = jsonData.profile.secondEmail;

		body = "Your name was claimed and reset to " + secondaryEmail + "<br>";
		body += "Go to <a href=\"https://genpact.galvin.ninja:8443\">https://genpact.galvin.ninja:8443</a> to login";
		res.render('pages/index',
		{
			body:  body
		});
	}

	//  Callbacks will peform the following:
	// - Get the user info from okta based on email
	// - alter the primary email to be what was in the secondary email
	// - tag the employeeType with "Alumni"
	// - Disconnect the user from original master several masters, with internal masters coming first they must be disconnected
	// - Render the results


        var Client = require('node-rest-client').Client;
        var client = new Client();
        var args =
        {
                headers:
                {
                        "Accept": "application/json",
                        "Content-Type": "application/json",
                        "Authorization": "SSWS " + config.apikey
                }
        };

	client.get("https://" + config.host + "/api/v1/users?q=" + primaryEmail, args, function (data, response)
	{

		if ( data.length > 0 )
			{ updatePrimaryEmail(data[0],args); }
		else
		{
			var body = fs.readFileSync("views/partials/claim_form.ejs", "utf8");
			body += "<br>I couldn't find a user with that email.  Try again.<br>";
	
                	res.render('pages/index',
                	{
                        	body:  body
                	});
		}

		
	}); 
	
});


// Run the Server
if (config.listenOnHTTP != "true")
        { console.log("Not configured to listen on http in config file."); }
else
{
        http.createServer(app).listen(config.httpPort);
        console.log("Server listening on port " + config.httpPort);
}

// Set SSL options here
if (config.listenOnHTTPS != "true")
        { console.log("Not configured to listen on https in config file."); }
else
{
        var serverOptions = {
                key: fs.readFileSync(config.sslKey),
                cert: fs.readFileSync(config.sslCert)
        };
        https.createServer(serverOptions, app).listen(config.httpsPort);
        console.log("SSL Server listening on port " + config.httpsPort);
}


