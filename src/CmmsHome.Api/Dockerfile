FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY ["src/CmmsHome.Api/CmmsHome.Api.csproj", "src/CmmsHome.Api/"]
RUN dotnet restore "src/CmmsHome.Api/CmmsHome.Api.csproj"
COPY . .
WORKDIR "/src/src/CmmsHome.Api"
RUN dotnet publish "CmmsHome.Api.csproj" -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0-noble-chiseled AS final
WORKDIR /app
COPY --from=build /app/publish .
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "CmmsHome.Api.dll"]
