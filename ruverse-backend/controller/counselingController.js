const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { Parser } = require('json2csv');
const mediasoup = require('mediasoup');
const https = require('https');

const { PassThrough } = require('stream');
const { time } = require('console');

const { Pool } = require('pg');
const OpenAI = require("openai");

const pool = new Pool({
    host: 'ruverse.cvnpqsvbcz4r.ap-northeast-2.rds.amazonaws.com',
    database: 'postgres',
    user: 'postgres',
    password: 'postgres',
    port: 5432,
    ssl: {
        rejectUnauthorized: false
      }
  });

pool.connect()
  .then(() => console.log('Connected to PostgreSQL database'))
  .catch(err => console.error('Connection error', err.stack));

const dl_client = axios.create({
    baseURL: process.env.DL_SERVER_URL,
    headers: {'Content-Type': 'application/json'}
});
const dl_client_tts = axios.create({
    baseURL: process.env.DL_SERVER_URL_TTS,
    headers: {'Content-Type': 'application/json'}
});

const csvFilename = 'timestamps.csv';
const csvPath = path.join(process.cwd(), csvFilename);

global.gpt_assistant_id = null;
global.gpt_thread_id = null;

//// STT, GPT API call in node.js 이거 다른 파일로 옮기기
const openai = new OpenAI(process.env.OPENAI_API_KEY);

async function transcribe_speech_nodejs(filename){
    const transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(filename),
        model: "whisper-1",
        language: "ko"
      });
    return transcription.text;
}
const filePath = path.join(__dirname, '../data/text/prompt_ver4.1.txt');
const gpt_prompt = fs.readFileSync(filePath, 'utf8'); ////// 이 부분 prompt_ver4 또는 ver5로 변경해야 함

async function create_assistant_nodejs(prompt = gpt_prompt){
    const gptAssistant = await openai.beta.assistants.create({
        name: "Rubis Counselor node.js",
        instructions: prompt,
        model: "gpt-4o",
        temperature: 0.5,
        top_p: 1.0   
    })
    return gptAssistant.id
}

async function create_thread_nodejs(){
    const gptThread = await openai.beta.threads.create();
    return gptThread.id
}

// Add Message to Thread Function
async function add_message_to_thread_nodejs(thread_id, role, content) {
    const response = await openai.beta.threads.messages.create(
      thread_id,
      {role: role,
      content: content,
    });
    return response.id;
}

// Function to Stream Responses and Send Sentences
async function* get_response_sentence(thread_id, assistant_id) {
    const response = await openai.beta.threads.runs.create(
      thread_id,
      {assistant_id: assistant_id,
      stream: true,
    });
    
    let chunk = '';
    const endTokens = ['.', '?', '!', ','];
    const sentenceQueue = [];
    for await (const event of response) {
        if (event.event == 'thread.message.delta'){
            const item = event.data.delta.content[0].text.value; // streaming 되는 음절들
            chunk += item;

            if (endTokens.some((token) => chunk.endsWith(token))) { // single sentence 완성되면 바로 반환
                let temp = chunk;
                temp = temp.replace(/【\d+:\d+†source】/g, '').trim();
                temp = temp.replace(/(H;|S;|N;)/g, '').trim();
                chunk = '';

                sentenceQueue.push(temp);
                yield temp;
              }
        }
    }
  }

  async function synthesize_speech_nodejs(text, filename, voice) { // TTS
    try {
      const textData = typeof text === "string" ? text : Array.from(text).join("");

      const response = await openai.audio.speech.create({
        model: "tts-1",
        input: textData,
        voice: voice,
        response_format: "wav",
      });
  
      const buffer = Buffer.from(await response.arrayBuffer());
      await fs.promises.writeFile(filename, buffer);
      console.log(`Audio saved to ${filename}`);
    } catch (error) {
      console.error("Error generating speech:", error);
    }
}

////DB FUNCTIONS
async function fetchData(query, params = []) { //FOR FETCHDATACONDITIONS AND SELECTDB
    try {
      const res = await pool.query(query, params);
      return res.rows;
    } catch (error) {
      console.error('Error executing SELECT query:', error.stack);
      throw error;
    }
}
  
async function fetchDataConditions(phoneNumber, uname, avatar) { //FOR FETCHANDLOGDATA FUNCTION
    // SQL query with placeholders for phoneNumber and uname
    const selectQuery = 'SELECT * FROM ruverse_db WHERE "phoneNumber" = $1 AND "uname" = $2 AND "avatar" = $3';
    
    try {
      // Pass the phoneNumber and uname as parameters to the query
      const data = await fetchData(selectQuery, [phoneNumber, uname, avatar]);
    //   console.log('Data for phoneNumber and uname:', phoneNumber, uname, data);
      return data;
    } catch (error) {
      console.error('Error fetching data by phoneNumber and uname and avatar:', error);
      throw error; // Rethrow error for further handling
    }
}

async function fetchAndLogData(phoneNumber, uname, avatar) { //SELECT THE ROWS WITH PHONE NUMBER AND UNAME
    try {
      const res = await fetchDataConditions(phoneNumber, uname, avatar);
      return res;
    } catch (error) {
      console.error('Error fetching data:', error);
    }
}

async function selectDB() { //SIMPLE SELECT
    const selectQuery = 'SELECT * FROM ruverse_db';
    try {
      const data = await fetchData(selectQuery);
      console.log('All Data:', data);
    } catch (error) {
      console.error('Error fetching data:', error);
    }
}

async function insertData(phoneNumber, uname, avatar, threadId, assistantId) {
    const insertQuery = `
      INSERT INTO ruverse_db ("phoneNumber", "uname", "avatar", "thread_id", "assistant_id", "timestamp") 
      VALUES ($1, $2, $3, $4, $5, NOW())
    `;
  
    try {
      const res = await pool.query(insertQuery, [phoneNumber, uname, avatar, threadId, assistantId]);
      console.log('Data inserted successfully:');
      return res; // Optionally return the result
    } catch (error) {
      console.error('Error inserting data:', error.stack);
      throw error; // Rethrow the error for further handling
    }
}

function saveCounselLog(logs, uname) {
    const fields = [
        'user_input_text', 'sttTime', 'sentence', 'gptTimePerSentence', 'ttsTimePerSentence', 'avatarPerSentence', 'avatarPer1SecMean'
    ];

    const csvPath = path.join(__dirname, `../../profiling_history/profiling_${uname}.csv`);

    const opts = { fields, header: !fs.existsSync(csvPath) };

    try {
        const parser = new Parser(opts);
        const csv = parser.parse(logs);

        if (fs.existsSync(csvPath)) {
            fs.appendFileSync(csvPath, '\n' + csv);
        } else {
            fs.writeFileSync(csvPath, csv + '\n');
        }
    } catch (err) {
        console.error('Error writing to CSV', err);
    }
}

module.exports.newSession = async (req, res, next) => {
    try {
        const uname = req.body.uname; 
        const phoneNumber = req.body.phoneNumber;
        // const avatar = "sonny";
        const avatar = req.body.selectedAvatar;
        console.log("uname: ", uname, ", phoneNum: ", phoneNumber, ", avatar: ", avatar);
        
        //// Check DB
        db_response = await fetchAndLogData(phoneNumber, uname, avatar);
        console.log("In DB: ", db_response[0]);
        if (db_response[0] === undefined || db_response[0].assistant_id === '{}'){
            //Create thread_id and assistant_id
            const gpt_assistant_id = await create_assistant_nodejs();
            const gpt_thread_id = await create_thread_nodejs();
            global.gpt_assistant_id = gpt_assistant_id;
            global.gpt_thread_id = gpt_thread_id;
            console.log("New Assistant Created ", global.gpt_assistant_id, global.gpt_thread_id);

            await insertData(phoneNumber, uname, avatar, gpt_thread_id, gpt_assistant_id);
            console.log("Inserted to DB");
        }
        else {
            global.gpt_assistant_id = db_response[0].assistant_id;
            global.gpt_thread_id = db_response[0].thread_id;
            console.log("Assistant_id and thread_id fetched from DB", global.gpt_assistant_id, global.gpt_thread_id);
        }


        res.json({status: "success"});
    } catch (ex) {   
          console.log("Error during initialization");   
          next(ex);
    }
}
module.exports.generateResponse = async (req, res, next) => {
    const timeProfiling1 = Date.now(); //// PROFILING
    let uname = null;  
    let phoneNumber = null;
    let selectedAvatar = null;
    let voice = null;
    let current_date = Date.now().toString();
    let pollingInterval;
    let sentence_cnt = 0;

    try {
        if (!req.file) {
          return res.status(400).send('No file uploaded');
        }
        const inputAudioFullPath = path.join(process.cwd(), req.file.path);
        uname = req.body.uname;
        phoneNumber = req.body.phoneNumber;
        selectedAvatar = req.body.selectedAvatar;

        if (selectedAvatar === "sonny") {
            voice = "onyx";
        } else if (selectedAvatar === "jennie") {
          voice = "nova";
        } else { // add more avatar if needed
          voice = "alloy";
        }

        console.log("uname: ", uname, "phoneNumber: ", phoneNumber, "avatar: ", selectedAvatar);
        console.log(req.body);

        //// Check the first video and return the url to the front-end
        async function checkFirstVideo() {
            const firstVideoFile = `${uname}_${current_date}_0.webm`;
            const filePath = `/mnt/Alchemist_2/MuseTalk/results/avatars/avator_3/vid_output/${firstVideoFile}`;
            
            try { // Check first video path
                if (fs.existsSync(filePath)) {
                    const videoPath = filePath.replace(
                        '/mnt/Alchemist_2/MuseTalk/results/avatars/avator_3/vid_output/',
                        'https://server.snuruverse.com/video/'
                    );

                    console.log("First video was generated at: ", Date.now(), "Video Path: ", videoPath);
                    
                    clearInterval(pollingInterval); // Stop polling

                    const firstVideoGenTime = Date.now(); //// PROFILING
                    console.log("First Video Gen Time (generateResposne호출했을 때부터 측정): ", (firstVideoGenTime - timeProfiling1) / 1000, "sec");
                    // Return the videoPath to the front
                    return res.json({
                        videoPath: videoPath,
                        numVideo: -1 // delete this?
                    });
                } 
            } catch (error) {
                console.error('Error checking first video path:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        }
        const timeProfiling2 = Date.now(); // PROFILING
        //// Cleaning wav file directories (tts, tts/temp_audio_segment)
        const output_path_prefix = path.join(process.cwd(), 'data/model_output/tts');
        const cleanWavDir = await dl_client.post('/clean_wav_dir', { 
            output_path_prefix: output_path_prefix,
        });

        //// STT
        const timeProfiling3 = Date.now();
        const user_input_text = await transcribe_speech_nodejs(inputAudioFullPath);
        const timeProfiling4 = Date.now();
        console.log("Transcription: ", user_input_text);
        // console.log("Comment out time: ", (timeProfiling2 - timeProfiling1) / 1000, "sec");
        // console.log("Cleaning wav file time: ", (timeProfiling3 - timeProfiling2) / 1000, "sec");
        const sttTime = (timeProfiling4 - timeProfiling3) / 1000;
        console.log("STT time: ", sttTime, "sec");
        
        //// GPT
        let gptStartTime = Date.now();
        await add_message_to_thread_nodejs(global.gpt_thread_id, 'user', `name: ${uname}, ${user_input_text}`); // Add user input to the thread
         
        setTimeout(() => {
            pollingInterval = setInterval(checkFirstVideo, 100); // Check first video
        }, 3000);

        //// GPT response stream 
        let allSentences = "";
        const avatarPromises = [];
        const logs = []; // Profiling logs 
        for await (const sentence of get_response_sentence(global.gpt_thread_id, global.gpt_assistant_id)) {
            console.log('상담사: ', sentence, ' sentence_cnt: ', sentence_cnt);
            const gptEndTime = Date.now();
            const gptTimePerSentence = (gptEndTime - gptStartTime) / 1000;
            console.log("GPT time per sentence: ", gptTimePerSentence, "sec");
            
            const wav_out_full_path = path.join(output_path_prefix, `out_${sentence_cnt}.wav`);
            
            //// TODO 이 부분을 tts server로 보내서 하는 거랑 시간 비교
            //// TTS
            const ttsStartTime = Date.now();
            await synthesize_speech_nodejs(sentence, wav_out_full_path, voice);
            const ttsEndTime = Date.now();
            const ttsTimePerSentence = (ttsEndTime - ttsStartTime) / 1000;
            console.log("TTS time per sentence : ", ttsTimePerSentence, "sec");

            const avatarStartTime = Date.now();
            const avatarData = {
                selected_avatar: selectedAvatar,
                sentence_cnt: sentence_cnt,
                output_path_prefix: output_path_prefix,
                output_file: `${uname}_${current_date}`,
            };

            // Send avatar_response POST without awaiting ---->> FIX 여기 await? no await?
            let avatarPer1SecMean = -1;
            // const avatarPromise = dl_client.post('/avatar_response', avatarData)
            const avatarPromise = await dl_client.post('/avatar_response', avatarData)
                .then(response => {
                    avatarPer1SecMean = response.data.avatar_time_per_1sec_mean;
                    console.log(`Avatar response for sentence ${sentence_cnt} processed.`);
                    return response.data;
                })
                .catch(error => {
                    console.error(`Error processing avatar for sentence ${sentence_cnt}:`, error);
                    throw error; // Decide how to handle individual avatar failures
                });
            
            const avatarEndTime = Date.now();
            const avatarPerSentence = (avatarEndTime - avatarStartTime) / 1000;
            console.log("Avatar per SENTENCE time: ", avatarPerSentence, "sec");

            avatarPromises.push(avatarPromise); // Collect the promise
            sentence_cnt++;
            allSentences += sentence;

            //// Profiling
            const logEntry = {
              user_input_text: user_input_text,
              sttTime: sttTime,
              sentence: sentence,
              gptTimePerSentence: gptTimePerSentence,
              ttsTimePerSentence: ttsTimePerSentence,
              avatarPerSentence: avatarPerSentence,
              avatarPer1SecMean: avatarPer1SecMean // 나중에 await 뺀다면 여기 말고 밖에서?
            };
            logs.push(logEntry);

            gptStartTime = Date.now(); // PROFILING
        } 
        await add_message_to_thread_nodejs(global.gpt_thread_id, "assistant", allSentences); // Add gpt response to the thread
        
        //// Wait for all avatar_response POSTs to complete
        const avatarResults = await Promise.all(avatarPromises);
        // console.log(avatarResults); ////??
        const timeProfiling5 = Date.now();
        console.log("All avatar responses have been processed (generateResposne호출했을 때부터 측정): ", (timeProfiling5 - timeProfiling1) / 1000, "sec");

        //// Send final_video POST after all avatars are processed
        const finalVideoResponse = await dl_client.post('/final_video', {
                output_file: `${uname}_${current_date}`,
                n_sentences: sentence_cnt
        });

        saveCounselLog(logs, uname); //// Profiling

    } catch (ex) {
        console.error("Error occurred in try block:", ex);  // 에러 발생 위치 로그
        next(ex);
    }     
};

module.exports.summarizeSession = async (req, res, next) => {
    // TODO
};
