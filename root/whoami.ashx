<%@ WebHandler Language="C#" Class="WhoAmI" %>

using System;
using System.Web;

public class WhoAmI : IHttpHandler
{
    public void ProcessRequest(HttpContext context)
    {
        context.Response.ContentType = "application/json";
        context.Response.ContentEncoding = System.Text.Encoding.UTF8;  // Force UTF-8 Encoding

        string username = context.User.Identity.Name;
        context.Response.Write("{\"username\": \"" + HttpUtility.JavaScriptStringEncode(username) + "\"}");
    }

    public bool IsReusable { get { return false; } }
}
