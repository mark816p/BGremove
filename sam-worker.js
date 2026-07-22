import { env, SamModel, AutoProcessor, RawImage } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.0';

env.allowLocalModels = false;

let model = null;
let processor = null;
let currentImageEmbeddings = null;

async function init() {
    if (model && processor) return;
    self.postMessage({ type: 'status', message: 'Loading AI Magic Brush...' });
    
    model = await SamModel.from_pretrained('Xenova/slimsam-77-uniform', {
        quantized: true,
        progress_callback: (info) => {
            if (info.status === 'progress') {
                self.postMessage({ type: 'progress', progress: info.progress });
            }
        }
    });
    
    processor = await AutoProcessor.from_pretrained('Xenova/slimsam-77-uniform');
    self.postMessage({ type: 'ready' });
}

self.onmessage = async (e) => {
    const data = e.data;
    
    if (data.type === 'init') {
        await init();
    } else if (data.type === 'embed') {
        try {
            self.postMessage({ type: 'status', message: 'Analyzing image for Magic Brush...' });
            
            // data.image is an ImageData object from the main thread
            const rawImage = new RawImage(new Uint8ClampedArray(data.image.data), data.image.width, data.image.height, 4);
            const image_inputs = await processor(rawImage);
            
            currentImageEmbeddings = await model.get_image_embeddings(image_inputs);
            self.postMessage({ type: 'embed_ready' });
        } catch (err) {
            console.error(err);
            self.postMessage({ type: 'error', error: err.message });
        }
    } else if (data.type === 'segment') {
        if (!currentImageEmbeddings) return;
        
        try {
            const point_inputs = await processor({
                points: [[[data.point.x, data.point.y]]],
                labels: [[[1]]] // 1 = foreground point
            });
            
            const outputs = await model({
                ...point_inputs,
                image_embeddings: currentImageEmbeddings
            });
            
            const masks = await processor.post_process_masks(
                outputs.pred_masks,
                point_inputs.original_sizes,
                point_inputs.reshaped_input_sizes
            );
            
            // masks is a list of tensors. masks[0] is for the first (and only) image.
            // Shape of masks[0]: [num_masks, height, width]
            // We'll just grab the first mask (index 0). Often SAM returns 3 masks, index 0 is usually best or we can use iou_scores.
            const scores = outputs.iou_scores.data;
            let bestIndex = 0;
            let maxScore = -Infinity;
            for(let i=0; i<scores.length; i++) {
                if(scores[i] > maxScore) {
                    maxScore = scores[i];
                    bestIndex = i;
                }
            }
            
            // Get the specific mask slice
            // Because masks[0] is a 3D tensor, we slice it to get the 2D tensor for bestIndex
            // Actually, we can just return the entire flat data and let main thread do the offset,
            // but it's cleaner to just slice it here.
            // The size of one mask is width * height
            const width = masks[0].dims[2];
            const height = masks[0].dims[1];
            const maskSize = width * height;
            
            const offset = bestIndex * maskSize;
            const maskSlice = masks[0].data.slice(offset, offset + maskSize);
            
            self.postMessage({
                type: 'segment_result',
                mask: maskSlice, // Float32Array or Uint8Array of logits > 0
                width: width,
                height: height
            });
            
        } catch (err) {
            console.error(err);
            self.postMessage({ type: 'error', error: err.message });
        }
    }
};
