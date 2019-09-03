const myPack = require('./util/guapack')

const __main = () => {
    let relativePath = './js/entry'
    let entry = require.resolve(relativePath)
    let distPath = 'dist/dudu/main.js'
    myPack(entry, distPath)
}

if (require.main === module) {
    __main()
}