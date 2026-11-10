import { BadRequestException, Body, Controller, Post, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

const PROMPT =
  'You are an elite automotive mechanical expert, car historian, and vintage spare parts auditor. ' +
  'Analyze this auto spare part photo. Even if the part is old, vintage, classic, obscure, rusty, or missing distinct badges, ' +
  'use your deep automotive knowledge of engineering, casting stamps, bolt pattern layouts, mounting styles, and structural aesthetics ' +
  'to deduce and fill out AT LEAST 70% of the requested keys using highly logical mechanical deduction. ' +
  'Extract the following information as a JSON object with these exact keys:\n' +
  '- "vehicleType": must be one of: "Car", "Truck", "Bike".\n' +
  '- "manufactureCountry": must be one of: "Germany (European)", "Japan (Asian)", "USA (American)", "South Korea (Asian)", "Italy (European)", "France (European)", "UK (British)", "China (Chinese)", "Other". Deduce the physical origin where this part or vehicle was likely assembled.\n' +
  '- "brandOriginCountry": must be one of the same country options as manufactureCountry. Represents the corporate headquarters of the car brand (e.g. BMW is originally a German brand, Toyota is a Japanese brand).\n' +
  '- "vehicleBrand": Brand of the car (e.g. "Toyota", "BMW", "Ford", "Mercedes-Benz"). If uncertain, deduce the most statistically probable brand based on casting/design styles.\n' +
  '- "modelName": Model range (e.g. "Corolla", "Camry", "M3", "E30", "Civic"). Make a highly logical vintage deduction.\n' +
  '- "manufactureYear": Four-digit year as a string (e.g., "1992", "1988"). If you cannot identify the exact year, deduce the most likely average year of the vehicle model range/era.\n' +
  '- "engineSize": Sizing (e.g. "2.0L", "2.5L", "1.6L"). Deduce the most common engine size option for this vehicle model era if the specific size is unidentifiable.\n' +
  '- "fuelType": must be one of: "Petrol", "Diesel", "Hybrid/EV". Deduce "Petrol" for most classic cars unless diesel styling is apparent.\n' +
  '- "category": must be one of: "Engine Parts", "Body Parts", "Brake System", "Suspension", "Electrical", "Accessories".\n' +
  '- "partName": The name of this spare part (e.g. "Water Pump", "Brake Disc", "Tail Light").\n' +
  '- "description": A highly informative summary explaining what the part is, its identified era, and its logical compatibility.\n' +
  'Return ONLY the raw JSON string inside your response, without markdown backticks.';

// Server-side Gemini proxy so the API key never ships inside the mobile app.
@Controller('ai')
@UseGuards(AuthGuard('jwt'))
export class AiController {
  @Post('analyze-part')
  async analyzePart(@Body('imageBase64') imageBase64: string, @Body('mimeType') mimeType = 'image/jpeg') {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new ServiceUnavailableException('AI is not configured');
    if (!imageBase64 || imageBase64.length > 10_000_000) throw new BadRequestException('imageBase64 is required (max ~7MB)');

    const model = process.env.GEMINI_MODEL || 'gemini-flash-latest';
    const body = JSON.stringify({
      contents: [{ parts: [{ text: PROMPT }, { inlineData: { mimeType, data: imageBase64 } }] }],
      generationConfig: { responseMimeType: 'application/json' },
    });

    for (let attempt = 1; attempt <= 3; attempt++) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-goog-api-key': key },
        body,
      });
      if ((res.status === 429 || res.status === 503) && attempt < 3) {
        await new Promise((r) => setTimeout(r, attempt * 2000));
        continue;
      }
      if (!res.ok) throw new ServiceUnavailableException(`AI request failed (${res.status})`);
      const data: any = await res.json();
      const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      try {
        return JSON.parse(text.replace(/^```(json)?|```$/g, '').trim());
      } catch {
        throw new ServiceUnavailableException('AI returned an unreadable answer');
      }
    }
  }
}
