import { readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const offlineDir = path.resolve('offline')
const assetsDir = path.join(offlineDir, 'assets')

const toPosixPath = (value) => value.split(path.sep).join('/')

const findFiles = async (dir, relativeDir = '') => {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const relativePath = path.join(relativeDir, entry.name)
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await findFiles(fullPath, relativePath)))
      continue
    }

    files.push(toPosixPath(relativePath))
  }

  return files
}

const assetFiles = await findFiles(assetsDir)
const scriptFile = assetFiles.find((file) => file.endsWith('.js'))
const styleFile = assetFiles.find((file) => file.endsWith('.css'))

if (!scriptFile) {
  throw new Error('Offline build did not produce a JavaScript bundle.')
}

const headLines = [
  '    <meta charset="UTF-8" />',
  '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
  '    <title>Garden Designer Ad</title>',
]

if (styleFile) {
  headLines.push(`    <link rel="stylesheet" href="./assets/${styleFile}" />`)
}

const html = `<!doctype html>
<html lang="en">
  <head>
${headLines.join('\n')}
  </head>
  <body>
    <div id="app"></div>
    <script src="./assets/${scriptFile}"></script>
  </body>
</html>
`

await writeFile(path.join(offlineDir, 'index.html'), html)
