export async function POST() {
  return Response.json({
    reply: "Test OK",
    matched_criteria: [],
    score_delta: 0,
    flags_to_set: {},
  });
}