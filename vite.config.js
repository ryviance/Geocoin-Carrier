export default {
  base: './', // keep relative paths when testing locally
  root: './docs', // set root directory where index.html is located
  build: {
    outDir: 'docs', // output the build inside the docs folder
    rollupOptions: {
      input: {
        main: './docs/index.html', // make sure Vite picks up the correct index.html
      },
    },
  },
};