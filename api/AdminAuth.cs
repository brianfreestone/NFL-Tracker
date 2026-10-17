using System.Security.Cryptography;
using System.Text;

namespace NflTracker.Api;

/// <summary>
/// Single-owner edit protection: write endpoints require the header X-Admin-Password
/// to match Admin:Password from configuration. If no password is configured, writes are refused.
/// </summary>
public static class AdminAuth
{
    public const string Header = "X-Admin-Password";

    public static bool IsValid(HttpRequest request, IConfiguration config)
    {
        var expected = config["Admin:Password"];
        if (string.IsNullOrEmpty(expected)) return false;
        var supplied = request.Headers[Header].ToString();
        return CryptographicOperations.FixedTimeEquals(Sha(supplied), Sha(expected));
    }

    private static byte[] Sha(string s) => SHA256.HashData(Encoding.UTF8.GetBytes(s));

    public static RouteHandlerBuilder RequireAdmin(this RouteHandlerBuilder builder) =>
        builder.AddEndpointFilter(async (ctx, next) =>
        {
            var http = ctx.HttpContext;
            if (IsValid(http.Request, http.RequestServices.GetRequiredService<IConfiguration>()))
                return await next(ctx);
            await Task.Delay(500); // slow down password guessing
            return Results.Unauthorized();
        });
}
