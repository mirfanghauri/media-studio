#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3500}"
WORK_DIR="${WORK_DIR:-tmp-api-test/regression}"
FAILED_JOB_ID="${FAILED_JOB_ID:-}"
MAX_WAIT_SECONDS="${MAX_WAIT_SECONDS:-240}"
mkdir -p "$WORK_DIR"

http_code() {
  awk '/^HTTP/{c=$2} END{print c}' "$1"
}

record() {
  local name="$1"
  local expected="$2"
  local got="$3"
  local extra="${4:-}"
  local state="FAIL"
  [[ "$expected" == "$got" ]] && state="PASS"
  printf "%s\t%s\texpected=%s\tgot=%s\t%s\n" "$state" "$name" "$expected" "$got" "$extra"
}

record_any() {
  local name="$1"
  local expectedList="$2"
  local got="$3"
  local extra="${4:-}"
  local state="FAIL"
  IFS=',' read -r -a expectedArray <<< "$expectedList"
  for expected in "${expectedArray[@]}"; do
    if [[ "$expected" == "$got" ]]; then
      state="PASS"
      break
    fi
  done
  printf "%s\t%s\texpected=%s\tgot=%s\t%s\n" "$state" "$name" "$expectedList" "$got" "$extra"
}

record_skip() {
  local name="$1"
  local reason="$2"
  printf "SKIP\t%s\t%s\n" "$name" "$reason"
}

request_json() {
  local name="$1" method="$2" path="$3" json="${4:-}"
  local h="$WORK_DIR/$name.headers"
  local b="$WORK_DIR/$name.body"

  if [[ -n "$json" ]]; then
    curl -sS -D "$h" -o "$b" -X "$method" "$BASE_URL$path" \
      -H 'content-type: application/json' --data "$json"
  else
    curl -sS -D "$h" -o "$b" -X "$method" "$BASE_URL$path"
  fi

  http_code "$h"
}

request_form() {
  local name="$1" method="$2" path="$3"
  shift 3
  local h="$WORK_DIR/$name.headers"
  local b="$WORK_DIR/$name.body"

  curl -sS -D "$h" -o "$b" -X "$method" "$BASE_URL$path" "$@"
  http_code "$h"
}

extract_json_field() {
  local filePath="$1"
  local fieldName="$2"
  node -e "const fs=require('fs');const j=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const v=j[process.argv[2]];process.stdout.write(v?String(v):'');" "$filePath" "$fieldName"
}

wait_until_job_done() {
  local jobId="$1"
  local maxWaitSeconds="${2:-240}"
  local waited=0

  while [[ $waited -lt $maxWaitSeconds ]]; do
    local statusBody
    statusBody=$(curl -sS "$BASE_URL/api/jobs/$jobId")
    local state
    state=$(echo "$statusBody" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{try{const j=JSON.parse(s);process.stdout.write(j.state||'')}catch{}})")
    if [[ "$state" == "completed" || "$state" == "failed" ]]; then
      echo "$state"
      return 0
    fi
    sleep 2
    waited=$((waited + 2))
  done

  echo "timeout"
}

ensure_fixtures() {
  mkdir -p tmp-api-test
  if [[ ! -f tmp-api-test/sample.mp4 ]]; then
    ffmpeg -y -f lavfi -i testsrc=size=320x240:rate=24 -f lavfi -i sine=frequency=1000:sample_rate=44100 \
      -t 3 -c:v libx264 -pix_fmt yuv420p -c:a aac tmp-api-test/sample.mp4 -loglevel error
  fi
  if [[ ! -f tmp-api-test/sample.txt ]]; then
    printf 'hello world\n' > tmp-api-test/sample.txt
  fi
  if [[ ! -f tmp-api-test/img1.jpg ]]; then
    ffmpeg -y -f lavfi -i color=c=red:s=320x240:d=1 -frames:v 1 tmp-api-test/img1.jpg -loglevel error
  fi
  if [[ ! -f tmp-api-test/img2.png ]]; then
    ffmpeg -y -f lavfi -i color=c=blue:s=320x240:d=1 -frames:v 1 tmp-api-test/img2.png -loglevel error
  fi
}

ensure_fixtures

echo "Running Media Studio API regression against $BASE_URL"

# 1. Health + overview
code=$(request_json "root" GET "/")
record "GET /" "200" "$code"

code=$(request_json "health" GET "/health")
record "GET /health" "200" "$code"

# 2. Uploads
code=$(request_form "upload_valid" POST "/api/upload" -F "file=@tmp-api-test/sample.mp4" -F "skipAI=true")
record "POST /api/upload (valid)" "202" "$code"
UPLOAD_JOB_ID=$(extract_json_field "$WORK_DIR/upload_valid.body" "jobId")

code=$(request_form "upload_invalid_type" POST "/api/upload" -F "file=@tmp-api-test/sample.txt")
record "POST /api/upload (invalid file type)" "400" "$code"

code=$(request_form "upload_missing_file" POST "/api/upload" -F "skipAI=true")
record "POST /api/upload (missing file)" "400" "$code"

# 3. Process endpoint
code=$(request_json "process_missing_path" POST "/api/process" '{}')
record "POST /api/process (missing videoPath)" "400" "$code"

code=$(request_json "process_not_found" POST "/api/process" '{"videoPath":"/app/storage/videos/non-existent/missing.mp4"}')
record "POST /api/process (not found)" "400" "$code"

if [[ -n "$UPLOAD_JOB_ID" ]]; then
  code=$(request_json "process_valid" POST "/api/process" "{\"videoPath\":\"/app/storage/videos/$UPLOAD_JOB_ID/sample.mp4\",\"options\":{\"skipAI\":true}}")
  record "POST /api/process (valid)" "202" "$code"
fi

# 4. Resize endpoint
SAMPLE_VIDEO_URL="${SAMPLE_VIDEO_URL:-https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4}"
code=$(request_json "resize_valid" POST "/api/video/resize" "{\"videoUrl\":\"$SAMPLE_VIDEO_URL\",\"width\":640,\"crf\":32,\"preset\":\"veryfast\"}")
record "POST /api/video/resize (valid)" "202" "$code"
RESIZE_JOB_ID=$(extract_json_field "$WORK_DIR/resize_valid.body" "jobId")

code=$(request_json "resize_bad_url" POST "/api/video/resize" '{"videoUrl":"not-a-url","width":640}')
record "POST /api/video/resize (invalid url)" "400" "$code"

code=$(request_json "resize_missing_dimensions" POST "/api/video/resize" "{\"videoUrl\":\"$SAMPLE_VIDEO_URL\"}")
record "POST /api/video/resize (missing dimensions)" "400" "$code"

# 5. Images endpoint
code=$(request_json "images_info" GET "/api/images-to-video/info")
record "GET /api/images-to-video/info" "200" "$code"

code=$(request_form "images_valid" POST "/api/images-to-video" -F "images=@tmp-api-test/img1.jpg" -F "images=@tmp-api-test/img2.png" -F "duration=2" -F "transition=fade" -F "skipAI=true")
record "POST /api/images-to-video (valid)" "202" "$code"
IMAGES_JOB_ID=$(extract_json_field "$WORK_DIR/images_valid.body" "jobId")

code=$(request_form "images_missing" POST "/api/images-to-video" -F "duration=2")
record "POST /api/images-to-video (missing images)" "400" "$code"

code=$(request_form "images_invalid_type" POST "/api/images-to-video" -F "images=@tmp-api-test/sample.txt")
record "POST /api/images-to-video (invalid type)" "400" "$code"

# 6. Jobs list
code=$(request_json "jobs_list" GET "/api/jobs")
record "GET /api/jobs" "200" "$code"

# 7. Job endpoints negative with invalid ID
code=$(request_json "job_status_invalid" GET "/api/jobs/not-a-uuid")
record "GET /api/jobs/{jobId} invalid" "404" "$code"

code=$(request_json "job_result_invalid" GET "/api/jobs/not-a-uuid/result")
record "GET /api/jobs/{jobId}/result invalid" "404" "$code"

code=$(request_json "job_download_invalid" GET "/api/jobs/not-a-uuid/download")
record "GET /api/jobs/{jobId}/download invalid" "400" "$code"

code=$(request_json "job_transcript_invalid" GET "/api/jobs/not-a-uuid/transcript")
record "GET /api/jobs/{jobId}/transcript invalid" "404" "$code"

code=$(request_json "job_raw_invalid" GET "/api/jobs/not-a-uuid/raw")
record "GET /api/jobs/{jobId}/raw invalid" "404" "$code"

code=$(request_json "job_retry_invalid" POST "/api/jobs/not-a-uuid/retry")
record "POST /api/jobs/{jobId}/retry invalid" "404" "$code"

# 8. Positive job-resource checks using upload job when available
if [[ -n "$UPLOAD_JOB_ID" ]]; then
  uploadState=$(wait_until_job_done "$UPLOAD_JOB_ID" "$MAX_WAIT_SECONDS")
  echo "upload job state: $uploadState"

  code=$(request_json "job_status_upload" GET "/api/jobs/$UPLOAD_JOB_ID")
  record "GET /api/jobs/{jobId} valid" "200" "$code"

  if [[ "$uploadState" == "completed" ]]; then
    code=$(request_json "job_result_upload" GET "/api/jobs/$UPLOAD_JOB_ID/result")
    record "GET /api/jobs/{jobId}/result valid" "200" "$code"

    code=$(request_json "job_download_upload" GET "/api/jobs/$UPLOAD_JOB_ID/download")
    record "GET /api/jobs/{jobId}/download valid" "200" "$code"

    code=$(request_json "job_transcript_upload" GET "/api/jobs/$UPLOAD_JOB_ID/transcript")
    record_any "GET /api/jobs/{jobId}/transcript valid" "200,404" "$code" "(404 allowed when transcript was not generated)"

    code=$(request_json "job_raw_upload" GET "/api/jobs/$UPLOAD_JOB_ID/raw")
    record_any "GET /api/jobs/{jobId}/raw valid" "200,400" "$code" "(400 allowed when no raw AI output exists)"
  else
    record_skip "GET /api/jobs/{jobId}/result valid" "job did not reach completed state (state=$uploadState)"
    record_skip "GET /api/jobs/{jobId}/download valid" "job did not reach completed state (state=$uploadState)"
    record_skip "GET /api/jobs/{jobId}/transcript valid" "job did not reach completed state (state=$uploadState)"
    record_skip "GET /api/jobs/{jobId}/raw valid" "job did not reach completed state (state=$uploadState)"
  fi

  # retry on completed/non-failed job should be 400
  code=$(request_json "job_retry_completed" POST "/api/jobs/$UPLOAD_JOB_ID/retry")
  record "POST /api/jobs/{jobId}/retry non-failed" "400" "$code"
fi

# Optional successful retry check if a failed job ID is supplied.
if [[ -n "$FAILED_JOB_ID" ]]; then
  code=$(request_json "job_retry_failed" POST "/api/jobs/$FAILED_JOB_ID/retry")
  record "POST /api/jobs/{jobId}/retry failed" "200" "$code" "(FAILED_JOB_ID provided)"
fi

echo "---"
echo "Key IDs: upload=$UPLOAD_JOB_ID images=$IMAGES_JOB_ID resize=$RESIZE_JOB_ID failed=${FAILED_JOB_ID:-none}"
echo "Saved artifacts under $WORK_DIR"
