const router = require("express").Router();
const path = require('path');
const fs = require('fs');

const getVideo = async (req, res, next) => {
    const { filename } = req.body;
    // res.status(200).send("video!");
    console.log(filename);

    const stream = fs.createReadStream(path.join("/data/Alchemist_2/ruverse-backend/temp_video_dir/", filename));
    
    stream.on('data', function(data) {
        res.write(data);
    });

    stream.on('end', function () {
        console.log('end streaming');
        res.end();
    });

    // var options = {
    //     headers: {
    //       'Cache-Control': 'public, max-age=3600',
    //       'Access-Control-Allow-Origin':'*'
    //     }
    // }
    // res.sendFile(path.join("/data/Alchemist_2/ruverse-backend/temp_video_dir/", filename), options);
}

const test = async (req, res, next) => {
    const { filename } = req.body;
    // res.status(200).send("video!");
    console.log(filename);

    
    var options = {
        headers: {
          'Cache-Control': 'public, max-age=3600',
          'Access-Control-Allow-Origin':'*'
        }
    }
    res.sendFile("/data/Alchemist_2/ruverse-backend/temp_video_dir/one_by_one_output_0_test.mp4", options);
}

router.post("/", getVideo);

router.get("/", test);

module.exports = router;