const express=require('express');
const app=express();

const cors=require('cors');
// CORS 설정을 가장 먼저 적용
const allowedOrigins = ['https://ruverse-client-vite.vercel.app/**', 'http://localhost:5173/**'];

var corsOpt={
    origin:true,
    methods:['GET','PUT','POST','DELETE','FETCH','OPTIONS'],
    preflightContinue:true,
    allowedHeaders:['Content-Type','Authorization','Content-length','X-Requested-With','Accept'],
    credentials:true
}
app.use(cors(corsOpt));
app.options('*', cors(corsOpt));

const http=require('http');
const https=require('https');

aws=function(){
    return false;
}
exports.aws=aws;



const session=require('express-session');
require("dotenv").config();
const db=require('./models/index');
const archiveRouter = require("./routes/archive.routes");
const archiveController=require("./controller/archive.controller");

//Jisu temp
const videoRouter = require("./routes/video")
// Jisu
// const socket = require("socket.io");
const counselingRouter = require("./routes/counseling")

const fs=require('fs');
const path=require('path');
const bodyParser = require('body-parser');

var AWS = require('aws-sdk');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended:false}))

// Jisu
app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'public, max-age=3600');
    next();
});


// app.options('*',cors(corsOpt));
// app.use(cors(corsOpt));


db.db.sequelize
.authenticate()
.then(()=>{
    console.log("Authenticated");
    db.db.sequelize.sync().then(()=>{
        console.log("Success")});
})

// Jisu


app.use("/counseling", counselingRouter);

app.use("/", archiveRouter);

app.use("/get_video", videoRouter);


// const options={
//     key:fs.readFileSync("./private.key"),
//     cert:fs.readFileSync("./certificate.crt"),
//     ca:fs.readFileSync("./ca_bundle.crt")
// }

const options={
    key:fs.readFileSync("./ruverse-server.key"),
    cert:fs.readFileSync("./ruverse-server.crt"),
    passphrase:'ruverse'
}

// https.createServer(options,app).listen(443,function(req,res){
//     console.log("Server started on port 443")
// });

// https.createServer(options,app).listen(13303,  '0.0.0.0',() => {
//    console.log('Server started on port 13303');
// });


// const server = http.createServer(app).listen(8080,function(req,res){
//   console.log("Server started on port 8080")
// })

 const server = http.createServer(app).listen(13303,function(req,res){
     console.log("Server started on port 13303")
 })

// Jisu


global.activeUsers = new Map();


// io.on("connection", (socket) => {

//     socket.on("add_user", (userId) => {
//         activeUsers.set(userId, {
//             socketId : socket.id,
//             assistantId : null,
//             threadId : null
//         });
//         console.log(activeUsers);
//     })

//     socket.on("disconnect", () => {
//         // Remove the user from activeUsers when they disconnect
//         for (const [userId, userData] of activeUsers.entries()) {
//             if (userData.socketId === socket.id) {
//                 activeUsers.delete(userId);
//                 break;
//             }
//         }
//         console.log(global.activeUsers);
//     });
// })

// const options={
//     key:fs.readFileSync("./private/key"),
//     cert:fs.readFileSync("./certificate.crt"),
//     ca:fs.readFileSync("./ca_bundle.crt")
// }
// https.createServer(options,app).listen(443,function(req,res){
//     console.log("Server started on port 443")
// });

