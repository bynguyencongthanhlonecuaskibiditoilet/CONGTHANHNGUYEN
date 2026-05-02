const express = require('express');
const multer = require('multer');
const fs = require('fs');
const { exec } = require('child_process');
const AdmZip = require('adm-zip');
const plist = require('plist');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.static('public'));

function getBundleId(ipaPath) {
  const zip = new AdmZip(ipaPath);
  const entries = zip.getEntries();

  const plistFile = entries.find(e =>
    e.entryName.includes('Info.plist')
  );

  if (!plistFile) return "com.example.app";

  const content = plist.parse(plistFile.getData().toString());
  return content.CFBundleIdentifier || "com.example.app";
}

app.post('/sign', upload.fields([
  { name: 'ipa' },
  { name: 'p12' },
  { name: 'mobileprovision' }
]), (req, res) => {

  const ipa = req.files['ipa'][0].path;
  const p12 = req.files['p12'][0].path;
  const mp = req.files['mobileprovision'][0].path;
  const password = req.body.password;

  const output = `public/signed_${Date.now()}.ipa`;

  const bundleId = getBundleId(ipa);

  // ⚠️ cần cài zsign trên server
  const cmd = `zsign -k ${p12} -p ${password} -m ${mp} -o ${output} ${ipa}`;

  exec(cmd, (err, stdout, stderr) => {
    if (err) {
      console.log(stderr);
      return res.json({ error: "Ký thất bại" });
    }

    const plistName = `public/${Date.now()}.plist`;

    const plistContent = `
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
<key>items</key>
<array>
<dict>
<key>assets</key>
<array>
<dict>
<key>kind</key>
<string>software-package</string>
<key>url</key>
<string>https://${req.headers.host}/${output.replace('public/', '')}</string>
</dict>
</array>
<key>metadata</key>
<dict>
<key>bundle-identifier</key>
<string>${bundleId}</string>
<key>bundle-version</key>
<string>1.0</string>
<key>kind</key>
<string>software</string>
<key>title</key>
<string>Signed App</string>
</dict>
</dict>
</array>
</dict>
</plist>
`;

    fs.writeFileSync(plistName, plistContent);

    const installLink = `itms-services://?action=download-manifest&url=https://${req.headers.host}/${plistName.replace('public/', '')}`;

    res.json({ link: installLink });
  });
});

app.listen(3000, () => console.log("Server chạy"));
