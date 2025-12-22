#!/bin/bash
# tools/generate-card.sh
# Quick card generator for JL-Mod Skins Database

echo "🎮 JL-Mod Skin Card Generator"
echo "=============================="
echo ""

# Get input from user
read -p "Skin ID (lowercase, no spaces, e.g: nokia5300): " id
read -p "Title: " title
read -p "Author: " author
read -p "Resolution (e.g: 240x320): " resolution
read -p "Orientation (portrait/landscape/both): " orientation
read -p "Category (device/game/console/custom): " category
read -p "Thumbnail path (e.g: thumb/nokia5300_thumb.jpg): " thumbnail
read -p "Download path (e.g: skins/Nokia5300.png): " download
read -p "Is New? (y/n): " isnew
read -p "Tags (comma separated, e.g: nokia,phone,music): " tags
read -p "Description (optional): " description

# Convert isNew to boolean
if [ "$isnew" = "y" ] || [ "$isnew" = "Y" ]; then
    isnew_bool="true"
else
    isnew_bool="false"
fi

# Convert tags to JSON array
IFS=',' read -ra TAG_ARRAY <<< "$tags"
tags_json="["
for i in "${!TAG_ARRAY[@]}"; do
    tag=$(echo "${TAG_ARRAY[$i]}" | xargs) # trim whitespace
    if [ $i -gt 0 ]; then
        tags_json+=", "
    fi
    tags_json+="\"$tag\""
done
tags_json+="]"

# Get current date
current_date=$(date +%Y-%m-%d)

# Create JSON file
cat > "/home/an29/Projects/jlskindb/cards/${id}.json" << EOF
{
  "id": "$id",
  "title": "$title",
  "author": "$author",
  "resolution": "$resolution",
  "orientation": "$orientation",
  "category": "$category",
  "thumbnail": "$thumbnail",
  "download": "$download",
  "isNew": $isnew_bool,
  "tags": $tags_json,
  "dateAdded": "$current_date",
  "description": "$description",
  "downloads": 0
}
EOF

echo ""
echo "✅ Card created: cards/${id}.json"
echo ""
echo "📝 Next steps:"
echo "1. Make sure thumb and skin files are uploaded"
echo "2. Add '${id}.json' to cards/_index.json"
echo "3. Commit and push to GitHub"
echo ""
echo "Done! 🚀"
