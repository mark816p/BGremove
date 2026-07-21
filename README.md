# Background Remover

A fast, private, and offline background removal tool built with vanilla JavaScript, HTML, and CSS. 
The background removal process happens entirely in the browser using WebAssembly via the [`@imgly/background-removal`](https://github.com/imgly/background-removal-js) library.

## Features

- **100% Client-Side:** No images are uploaded to any server. Your data remains private.
- **Batch Processing:** Drag and drop multiple images at once.
- **Modern UI:** Inspired by AdiosMetadata, with support for Light and Dark modes.
- **Compare Tool:** Hover over processed images to see the original version.
- **Bulk Download:** Download all processed images as a single `.zip` archive.

## Usage

Simply open the page in any modern web browser.
1. Drag and drop your images into the designated area, or click to select files.
2. The browser will automatically download the required models (first time only) and begin processing the images sequentially.
3. Preview the results directly on the screen.
4. Click "Download" under each image, or "Download All as ZIP" when everything is finished.

## Technologies Used

- Vanilla HTML, CSS, JavaScript (ES6 Modules)
- `@imgly/background-removal` for the ML inference in the browser.
- `JSZip` for creating ZIP files directly in the browser.
- Google Fonts (Inter)
- SVG Icons from Lucide

## Deployment

The application is designed to be hosted directly as static files. This repository is configured to deploy directly to GitHub Pages from the `main` branch.

## License

This project is open-source and available under the MIT License.
