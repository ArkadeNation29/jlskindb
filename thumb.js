const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '50mb' }));

app.post('/save-thumbnail', (req, res) => {
    const { imageName, thumbnailData } = req.body;
    const filePath = path.join(__dirname, 'thumb', `${imageName}.png`);

    const base64Data = thumbnailData.replace(/^data:image\/jpeg;base64,/, '');

    fs.writeFile(filePath, base64Data, 'base64', (err) => {
        if (err) {
            console.error('Error saving thumbnail:', err);
            return res.status(500).send('Error saving thumbnail');
        }
        res.send('Thumbnail saved');
    });
});

app.listen(3000, () => {
    console.log('Server running on port 3000');
});