import os
import sys
sys.path.append(os.path.abspath('..'))
from flask import Flask, request, jsonify
import json
from pydub import AudioSegment
import subprocess
import numpy as np
import time
import glob
import contextlib
import wave
import math
import pandas as pd
import queue
import threading
BASE_PATH = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(BASE_PATH, "mnt")
DEFAULT_OUTPUT_PATH = BASE_PATH

processing = False
sentence_queue = queue.Queue()

app = Flask(__name__)

###### MuseTalk ######

os.chdir("../MuseTalk")
sys.path.append(os.getcwd())
from MuseTalk.scripts.realtime_inference_try import Avatar

default_avatar = Avatar('avator_3', None, 5, 4, False)

jennie_only_fronts = [
    Avatar(f'avator_jennie_only_front_{i}', None, 5, 4, False) for i in range(20)
]

sonny_only_fronts = [
    Avatar(f'avator_sonny_only_front_{i}', None, 5, 4, False) for i in range(20)
]

avatars_dict = {'sonny': sonny_only_fronts, 'jennie': jennie_only_fronts} 

os.chdir("../ruverse-backend")

def delete_wav_files(folder_path, filename=None):
    if filename:
        wav_files = [os.path.join(folder_path, filename)]
    else:
        wav_files = glob.glob(os.path.join(folder_path, '*.wav'))
    
    for wav_file in wav_files:
        try:
            if os.path.exists(wav_file):
                os.remove(wav_file)
                print(f"Deleted: {wav_file}")
            else:
                print(f"File not found: {wav_file}")
        except Exception as e:
            print(f"Error deleting {wav_file}: {e}")

def convert_wav_file(input_filename, output_filename):
    try:
        subprocess.run(
            ['ffmpeg', '-y', '-loglevel', 'quiet', '-i', input_filename, '-c', 'copy', output_filename],
            check=True
        )
        print(f"File successfully converted to {output_filename}")
    except subprocess.CalledProcessError as e:
        print(f"Error during file conversion: {e}")
        return False
    return True

def split_wav_file(input_filename, output_folder, num_wav_in_temp_audio_segment, segment_length=1000):
    
    convert_wav_file(input_filename, '/mnt/Alchemist_2/ruverse-backend/data/model_output/tts/out_mod.wav')
    
    # Create output directory if it doesn't exist
    if not os.path.exists(output_folder):
        os.makedirs(output_folder)
    
    try:
        audio = AudioSegment.from_file('/mnt/Alchemist_2/ruverse-backend/data/model_output/tts/out_mod.wav', format="wav")
    except Exception as e:
        print(f"Error loading audio file: {e}")
        return
    
    total_duration = len(audio)
    num_segments = int(np.ceil(total_duration / segment_length))
    
    for i in range(num_segments):
        start_time = i * segment_length
        end_time = start_time + segment_length
        segment = audio[start_time:end_time]
        
        if len(segment) < segment_length:
            silence = AudioSegment.silent(duration=segment_length - len(segment))
            segment += silence
        
        segment_filename = os.path.join(output_folder, f"segment_{num_wav_in_temp_audio_segment+i}.wav")
        segment.export(segment_filename, format="wav")
    return num_segments

@app.route('/clean_wav_dir', methods=['POST'])
def clean_wav_dir_route():
    req = request.get_json()  
    
    model_output_tts_path = req['output_path_prefix'] # ....data/model_output/tts
    temp_audio_segment_path = f'{model_output_tts_path}/temp_audio_segment' # ....data/model_output/tts/temp_audio_segment

    delete_wav_files(temp_audio_segment_path) 
    delete_wav_files(model_output_tts_path) 
    
    num_wav_tts = len([f for f in os.listdir(model_output_tts_path) if f.endswith('.wav')])
    num_wav_tts_temp_audio_segment = len(os.listdir(temp_audio_segment_path))
    
    return jsonify({"num_wav_tts": num_wav_tts, "num_wav_tts_temp_audio_segment": num_wav_tts_temp_audio_segment})

@app.route('/avatar_response', methods=['POST'])
def avatar_route():
    req = request.get_json()  
    profiling_df = pd.DataFrame(columns=['role', 'text','stt_latency', 'gpt_per_sentence_latency', 'tts_per_sentence_latency'])
    avatar_name = req['selected_avatar']
    selected_avatar = avatars_dict[avatar_name]
    sentence_cnt = int(req['sentence_cnt'])
    output_path_prefix = req['output_path_prefix']
    wav_out_full_path = f"{output_path_prefix}/out_{sentence_cnt}.wav"
    
    if not (req['output_file']):
        avatar_output_file = DEFAULT_OUTPUT_PATH
    else:
        avatar_output_file = req['output_file']
    input_audio, output_path = wav_out_full_path, avatar_output_file
    
    input_audio_path = os.path.dirname(input_audio)
    print(f'input audio path: {input_audio}')

    output_folder = f'{input_audio_path}/temp_audio_segment/'
    num_wav_in_temp_audio_segment = len([f for f in os.listdir(output_folder) if f.endswith('.wav')])
    num_audio_file = split_wav_file(input_audio, output_folder, num_wav_in_temp_audio_segment, segment_length=1000)
    
    os.chdir("../MuseTalk")
    print(num_audio_file)
    avatar_times = []
    for segment_wav_counter in range(num_wav_in_temp_audio_segment, num_wav_in_temp_audio_segment + num_audio_file):
        input_audio_chunk = f'{input_audio_path}/temp_audio_segment/segment_{segment_wav_counter}.wav'
        avatar_number = segment_wav_counter % len(selected_avatar)
       
        avatar_inference_start_time = time.time()
        output_vid = selected_avatar[avatar_number].inference(input_audio_chunk, output_path, 30, False, avatar_number, segment_wav_counter)
        
        avatar_inference_end_time = time.time() 
        
        avatar_time_per_1sec = avatar_inference_end_time - avatar_inference_start_time
        avatar_times.append(avatar_time_per_1sec)
        
    if avatar_times:
        avatar_time_per_1sec_mean = np.mean(avatar_times)
        print(f"Average avatar time per 1 sec: {avatar_time_per_1sec_mean} sec")
    else:
        avatar_time_per_1sec_mean = -1.0
        print("No avatar inference times recorded.")
    return jsonify({"avatar_time_per_1sec_mean": avatar_time_per_1sec_mean})
    
@app.route('/final_video', methods=['POST']) ## 마지막에 빈 webm 생성
def final_video_route():  
      
    os.chdir("../ruverse-backend")  
    req = request.get_json()  
    if not (req['output_file']):
        output_path = DEFAULT_OUTPUT_PATH
    else:
        output_path = req['output_file']
    final_vid = f'/mnt/Alchemist_2/MuseTalk/results/avatars/avator_3/vid_output/{output_path}_final.webm'
    try:
        # ffmpeg를 사용하여 빈 webm 파일 생성
        subprocess.run(
            ['ffmpeg', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', 
             '-t', '1', '-vf', 'color=c=black:s=1280x720', '-c:v', 'libvpx-vp9', 
             '-b:v', '1M', '-loglevel', 'quiet', final_vid],
            check=True
        )
        print(f"Empty webm file successfully created at {final_vid}")
    except subprocess.CalledProcessError as e:
        print(f"Error during file creation: {e}")
    
    return jsonify({"finalVideoPath": final_vid})



if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, threaded=True)
