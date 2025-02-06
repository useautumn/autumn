# Run current file
# npx tsx scripts/alex.ts
filename=$1
npx tsx $filename
# # If filename ends with .sh, then run it
# if [ "${filename##*.}" = "sh" ]; then
#     ./$filename
# else if [ "${filename##*.}" = "ts" ]; then
#     npx tsx $filename
# else
#     echo "Invalid file extension"
# fi

# # npm run test