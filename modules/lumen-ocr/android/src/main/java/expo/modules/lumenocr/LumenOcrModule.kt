package expo.modules.lumenocr

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.math.ceil
import kotlin.math.min

/** Abaixo desta largura o texto de um print fica pequeno demais para o ML Kit. */
private const val MIN_WIDTH = 900

/**
 * OCR no aparelho com o ML Kit. Devolve cada linha com a posição dela na imagem:
 * é a geometria que permite ligar a descrição ao valor na mesma linha da fatura.
 */
class LumenOcrModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LumenOcr")

    AsyncFunction("recognize") { uri: String, promise: Promise ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val image = try {
        loadImage(context, Uri.parse(uri))
      } catch (e: Exception) {
        promise.reject("E_OCR_IMAGE", "Não foi possível abrir a imagem: ${e.message}", e)
        return@AsyncFunction
      }
      val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
      recognizer.process(image)
        .addOnSuccessListener { result ->
          val lines = mutableListOf<Map<String, Any>>()
          for (block in result.textBlocks) {
            for (line in block.lines) {
              val box = line.boundingBox ?: continue
              lines.add(
                mapOf(
                  "text" to line.text,
                  "left" to box.left,
                  "top" to box.top,
                  "width" to box.width(),
                  "height" to box.height(),
                )
              )
            }
          }
          promise.resolve(mapOf("width" to image.width, "height" to image.height, "lines" to lines))
          recognizer.close()
        }
        .addOnFailureListener { e ->
          promise.reject("E_OCR", e.message ?: "Falha no reconhecimento de texto", e)
          recognizer.close()
        }
    }
  }

  /**
   * Print pequeno (captura reduzida, imagem recebida por mensagem) é ampliado antes da
   * leitura: com a letra maior o ML Kit lê o que antes deixava passar.
   */
  private fun loadImage(context: android.content.Context, uri: Uri): InputImage {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
    if (bounds.outWidth <= 0 || bounds.outWidth >= MIN_WIDTH) return InputImage.fromFilePath(context, uri)
    val bitmap = context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it) }
      ?: return InputImage.fromFilePath(context, uri)
    val factor = min(3.0, ceil(MIN_WIDTH.toDouble() / bitmap.width))
    val scaled = Bitmap.createScaledBitmap(bitmap, (bitmap.width * factor).toInt(), (bitmap.height * factor).toInt(), true)
    return InputImage.fromBitmap(scaled, 0)
  }
}
