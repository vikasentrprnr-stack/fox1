import { useState, useRef } from 'react';
import { UploadCloud, Layers, Sparkles, X } from 'lucide-react';
import { categorizeAndClusterImages } from '@/services/ai';
import { cn } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';

interface ClusterResult {
  categoryName: string;
  reasoning: string;
  imageIndices: number[];
}

export function ImageClustering() {
  const [images, setImages] = useState<{ id: string; url: string; b64: string }[]>([]);
  const [clusters, setClusters] = useState<ClusterResult[]>([]);
  const [isClustering, setIsClustering] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    
    // reset clusters on new upload
    setClusters([]);

    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      
      const reader = new FileReader();
      reader.onload = (e) => {
        const b64 = e.target?.result as string;
        setImages((prev) => [...prev, { id: uuidv4(), url: URL.createObjectURL(file), b64 }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const removeImage = (id: string) => {
    setImages(prev => prev.filter(img => img.id !== id));
    setClusters([]);
  };

  const startClustering = async () => {
    if (images.length === 0) return;
    setIsClustering(true);
    try {
      const b64s = images.map(img => img.b64);
      const results = await categorizeAndClusterImages(b64s);
      setClusters(results);
    } catch (e) {
      console.error(e);
      alert("Failed to cluster images. Please try again.");
    } finally {
      setIsClustering(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] text-gray-100 overflow-y-auto">
      <div className="px-6 py-8 md:py-12 max-w-6xl mx-auto w-full md:pl-6 pl-16">
        <h2 className="text-3xl font-semibold tracking-tight mb-2">Workspace <span className="text-purple-400">Fox AI</span></h2>
        <p className="text-gray-400 mb-8 max-w-2xl text-[15px] leading-relaxed">
          Upload a batch of images. Fox AI will use unsupervised learning algorithms to analyze, categorize, and group them based on visual similarity and deep semantics.
        </p>

        <div 
          className="border-2 border-dashed border-[#2a2a2a] bg-[#141414] rounded-3xl p-10 md:p-14 text-center cursor-pointer transition-colors hover:border-purple-500/50 hover:bg-[#1a1a1a] flex flex-col items-center justify-center mb-10 group"
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          <div className="w-16 h-16 bg-[#1f1f1f] rounded-2xl flex items-center justify-center text-purple-400 mb-4 group-hover:scale-110 transition-transform shadow-xl shadow-black/50">
            <UploadCloud size={32} />
          </div>
          <p className="font-medium text-lg mb-2">Click or drag images here</p>
          <p className="text-gray-500 text-sm">Supports JPG, PNG, WEBP (Max 10 images recommended at once)</p>
          <input 
            type="file" 
            multiple 
            accept="image/*" 
            className="hidden" 
            ref={fileInputRef} 
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>

        {images.length > 0 && (
          <div className="mb-10">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-medium tracking-tight">Uncategorized Pool ({images.length})</h3>
              <button 
                onClick={startClustering}
                disabled={isClustering}
                className={cn(
                  "px-6 py-2.5 rounded-xl font-medium flex items-center space-x-2 transition-all shadow-lg",
                  isClustering ? "bg-[#1f1f1f] text-gray-400 cursor-not-allowed" : "bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 text-white shadow-purple-500/25"
                )}
              >
                {isClustering ? (
                  <>
                    <Sparkles className="animate-spin mr-2" size={18} />
                    Processing...
                  </>
                ) : (
                  <>
                    <Layers size={18} className="mr-2" />
                    Auto-Cluster
                  </>
                )}
              </button>
            </div>
            
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
              {images.map((img) => (
                <div key={img.id} className="relative group">
                  <img src={img.url} alt="Uploaded" className="w-full aspect-square object-cover rounded-2xl border border-[#2a2a2a] shadow-sm" />
                  <button 
                    onClick={() => removeImage(img.id)}
                    className="absolute top-2 right-2 p-1.5 bg-black/60 backdrop-blur-md rounded-lg text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/80"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {clusters.length > 0 && (
          <div className="space-y-10 border-t border-[#1f1f1f] pt-10">
            <h3 className="text-2xl font-semibold tracking-tight flex items-center">
              <Sparkles className="text-purple-400 mr-3" size={24} />
              AI Clusters ({clusters.length})
            </h3>
            
            <div className="space-y-8">
              {clusters.map((cluster, i) => (
                <div key={i} className="bg-[#141414] border border-[#2a2a2a] rounded-3xl p-6 md:p-8">
                  <div className="mb-6 md:w-2/3">
                    <h4 className="text-xl font-medium tracking-tight mb-2 text-pink-100">{cluster.categoryName}</h4>
                    <p className="text-sm text-gray-400 leading-relaxed">{cluster.reasoning}</p>
                  </div>
                  
                  <div className="flex flex-wrap gap-4">
                    {cluster.imageIndices.map((idx) => {
                      const img = images[idx];
                      if (!img) return null;
                      return (
                        <div key={idx} className="w-32 h-32 md:w-40 md:h-40 shrink-0">
                           <img src={img.url} alt="" className="w-full h-full object-cover rounded-2xl shadow-md border border-[#2a2a2a]" />
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
