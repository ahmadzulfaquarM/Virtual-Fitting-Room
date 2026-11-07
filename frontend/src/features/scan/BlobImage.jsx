import { useEffect, useRef } from 'react'

/**
 * Shows a Blob as an image. The object URL is created when the blob is attached and revoked when
 * it changes or the component unmounts, so no photo is kept alive after the review screen closes.
 */
export function BlobImage({ blob, alt, className }) {
  const ref = useRef(null)
  useEffect(() => {
    const img = ref.current
    if (!img || !blob) return undefined
    const url = URL.createObjectURL(blob)
    img.src = url
    return () => {
      URL.revokeObjectURL(url)
      img.removeAttribute('src')
    }
  }, [blob])
  return <img ref={ref} alt={alt} className={className} />
}
